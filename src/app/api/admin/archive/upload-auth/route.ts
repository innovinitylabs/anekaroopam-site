import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { resolveCommitIdentity } from "@/lib/archive/accession-mint";
import { githubStorageAvailable } from "@/lib/archive/draft-github-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { sourceFilenameForUpload } from "@/lib/archive/schema";
import { r2ArchiveReady, requireR2Config } from "@/lib/r2/config";
import {
  buildAllRevisionKeys,
  isAllowedArchiveObjectKey,
} from "@/lib/r2/object-keys";
import { createPresignedPut } from "@/lib/r2/presign";
import { headR2Object } from "@/lib/r2/verify";

export const runtime = "nodejs";

interface UploadAuthBody {
  slug?: string;
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

  if (!githubStorageAvailable()) {
    return NextResponse.json(
      { error: "Durable GitHub storage is required for R2 upload-auth." },
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

    const identity = await resolveCommitIdentity({
      isExistingArchive: Boolean(body.isExistingArchive),
      slug,
    });

    const keys = buildAllRevisionKeys({
      accessionId: identity.accessionId,
      revision: identity.revision,
      storedFilename,
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
      const key = roleToKey.get(obj.role);
      if (!key) {
        return NextResponse.json(
          { error: `Unknown upload role: ${obj.role}` },
          { status: 400 },
        );
      }
      if (
        !isAllowedArchiveObjectKey(
          key,
          identity.accessionId,
          identity.revision,
        )
      ) {
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
        if (sameSize) {
          // Resume: still issue a fresh PUT URL so the client can skip or re-PUT.
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
      accessionId: identity.accessionId,
      draftId: identity.draftId,
      revision: identity.revision,
      publicBaseUrl: config.publicBaseUrl,
      uploads,
      existingEntry: identity.existingEntry,
    });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "upload-auth failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
