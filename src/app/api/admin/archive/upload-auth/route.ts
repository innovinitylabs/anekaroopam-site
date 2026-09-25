import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { resolveCommitIdentity } from "@/lib/archive/accession-mint";
import { githubStorageAvailable } from "@/lib/archive/draft-github-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { sourceFilenameForUpload } from "@/lib/archive/schema";
import {
  formatByteSize,
  isSourceWithinLimit,
  resolveMaxSourceBytes,
  sourceOverLimitMessage,
} from "@/lib/archive/commit-bundle-limits";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ensureWorkerArtworkForDraft,
  findWorkerArtworkByDraftOrSlug,
} from "@/lib/archive/worker-drafts";
import { ArchiveWorkerError } from "@/lib/archive/worker-client";
import { r2ArchiveReady, requireR2Config } from "@/lib/r2/config";
import {
  buildAllRevisionKeys,
  getR2KeyPrefixFromEnv,
  isAllowedArchiveObjectKey,
} from "@/lib/r2/object-keys";
import { createPresignedPut } from "@/lib/r2/presign";
import { headR2Object } from "@/lib/r2/verify";

export const runtime = "nodejs";

interface UploadAuthBody {
  slug?: string;
  draftId?: string;
  isExistingArchive?: boolean;
  storedFilename?: string;
  objects?: Array<{
    role: string;
    filename: string;
    contentType: string;
    contentLength: number;
  }>;
  retrySameRevision?: boolean;
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  const useWorker = preferArchiveWorker();
  if (!useWorker && !githubStorageAvailable()) {
    return NextResponse.json(
      {
        error:
          "Durable storage required for R2 upload-auth (configure ARCHIVE_WORKER_* or GitHub archive).",
      },
      { status: 503 },
    );
  }
  if (!r2ArchiveReady()) {
    return NextResponse.json(
      {
        error:
          "R2 archive storage is not enabled or configured. Set R2_ARCHIVE_ENABLED and R2_* credentials.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as UploadAuthBody;
    const slug = String(body.slug ?? "").trim();
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const storedFilename = sourceFilenameForUpload(
      body.storedFilename?.trim() || "original.bin",
    );
    const objects = body.objects ?? [];
    if (objects.length < 1 || objects.length > 16) {
      return NextResponse.json(
        { error: "objects must contain 1–16 upload specs" },
        { status: 400 },
      );
    }

    let accessionId: string;
    let draftId: string;
    let revision: number;
    let artworkId: string | null = null;
    let existingEntry: unknown = null;

    if (useWorker) {
      const draftIdInput = body.draftId?.trim() || `draft-for-${slug}`;
      let artwork = await findWorkerArtworkByDraftOrSlug({
        draftId: body.draftId?.trim(),
        slug,
      });
      if (!artwork) {
        artwork = await ensureWorkerArtworkForDraft({
          draftId: draftIdInput,
          slug,
          title: slug,
          idempotencyKey: `upload-auth:${draftIdInput}`,
        });
      }
      accessionId = artwork.accessionId;
      draftId = artwork.draftId;
      revision = artwork.workingRevision;
      artworkId = artwork.id;
      existingEntry = null;
    } else {
      const identity = await resolveCommitIdentity({
        isExistingArchive: Boolean(body.isExistingArchive),
        slug,
      });
      accessionId = identity.accessionId;
      draftId = identity.draftId;
      revision = identity.revision;
      existingEntry = identity.existingEntry;
    }

    const keyPrefix = getR2KeyPrefixFromEnv();
    const keys = buildAllRevisionKeys({
      accessionId,
      revision,
      storedFilename,
      keyPrefix,
    });

    const roleToKey = new Map<string, string>([
      ["original", keys.original],
      ["prepared", keys.prepared],
      ["artwork", keys.derivatives.artwork],
      ["preview", keys.derivatives.preview],
      ["previewWebp", keys.derivatives.previewWebp],
      ["social", keys.derivatives.social],
      ["thumb", keys.derivatives.thumb],
    ]);

    const config = requireR2Config();
    const uploads = [];

    for (const obj of objects) {
      if (
        !Number.isFinite(obj.contentLength) ||
        obj.contentLength < 1
      ) {
        return NextResponse.json(
          { error: `contentLength required for role ${obj.role}` },
          { status: 400 },
        );
      }
      if (
        obj.role === "original" &&
        !isSourceWithinLimit(obj.contentLength)
      ) {
        return NextResponse.json(
          {
            error: sourceOverLimitMessage(obj.contentLength),
            limit: resolveMaxSourceBytes(),
            detail: `Original master over limit (${formatByteSize(obj.contentLength)}).`,
          },
          { status: 413 },
        );
      }
      const key = roleToKey.get(obj.role);
      if (!key) {
        return NextResponse.json(
          { error: `Unknown upload role: ${obj.role}` },
          { status: 400 },
        );
      }
      if (!isAllowedArchiveObjectKey(key, accessionId, revision, keyPrefix)) {
        return NextResponse.json(
          { error: `Refusing unauthorized object key for role ${obj.role}` },
          { status: 400 },
        );
      }
      if (
        obj.role !== "original" &&
        obj.role !== "prepared" &&
        !key.endsWith(`/${obj.filename}`)
      ) {
        return NextResponse.json(
          {
            error: `filename mismatch for role ${obj.role}: expected key ending with ${obj.filename}`,
          },
          { status: 400 },
        );
      }

      const existing = await headR2Object(key);
      if (existing.exists) {
        const sameSize = existing.contentLength === obj.contentLength;
        if (!sameSize && !body.retrySameRevision) {
          return NextResponse.json(
            {
              error: `Object already exists and size differs: ${key}. Use a new revision or retrySameRevision after a partial failure.`,
            },
            { status: 409 },
          );
        }
      }

      const put = await createPresignedPut({
        key,
        contentType: obj.contentType,
        contentLength: obj.contentLength,
      });
      uploads.push(put);
    }

    return NextResponse.json({
      accessionId,
      draftId,
      revision,
      artworkId,
      keyPrefix,
      publicBaseUrl: config.publicBaseUrl,
      uploads,
      existingEntry,
      source: useWorker ? "worker" : "github",
    });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "upload-auth failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
