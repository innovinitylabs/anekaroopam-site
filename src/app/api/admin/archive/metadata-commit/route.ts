import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { githubStorageAvailable } from "@/lib/archive/draft-github-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { validateMetadataCommitMedia } from "@/lib/archive/metadata-commit-media";
import {
  assertAllowedMetadataCommitPaths,
  normalizeMetadataCommitPath,
} from "@/lib/archive/metadata-commit-paths";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ArchiveWorkerError,
  workerMarkReady,
  workerPatchArtwork,
  workerPublish,
} from "@/lib/archive/worker-client";
import {
  findWorkerArtworkByDraftOrSlug,
  updateDraftViaWorker,
} from "@/lib/archive/worker-drafts";
import { commitFiles } from "@/lib/github/git-commit";
import { r2ArchiveReady } from "@/lib/r2/config";
import { verifyR2Objects } from "@/lib/r2/verify";
import type { AccessionDraft } from "@/lib/archive/schema";

export const runtime = "nodejs";

interface MetadataCommitBody {
  slug?: string;
  draftId?: string;
  artworkId?: string;
  message?: string;
  publish?: boolean;
  metadata?: unknown;
  perception?: unknown;
  export?: unknown;
  provenance?: unknown;
  artwork?: AccessionDraft["artwork"];
  textFiles?: Array<{ path: string; content: string }>;
  media?: {
    accessionId?: string;
    revision?: number;
    objects?: Array<{
      key: string;
      contentType: string;
      contentLength: number;
    }>;
  };
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  const useWorker = preferArchiveWorker();
  if (!useWorker && !githubStorageAvailable()) {
    return NextResponse.json(
      {
        error:
          "Durable storage required for metadata-commit (ARCHIVE_WORKER_* or GitHub).",
      },
      { status: 503 },
    );
  }
  if (!r2ArchiveReady()) {
    return NextResponse.json(
      { error: "R2 archive storage is not enabled or configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as MetadataCommitBody;
    const slug = String(body.slug ?? "").trim();
    const draftId =
      typeof body.draftId === "string" && body.draftId.trim()
        ? body.draftId.trim()
        : undefined;
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : `archive: metadata ${slug || "unknown"}`;
    const textFiles = body.textFiles ?? [];

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const mediaCheck = validateMetadataCommitMedia(body.media ?? {});
    if (!mediaCheck.ok) {
      return NextResponse.json({ error: mediaCheck.error }, { status: 400 });
    }

    const { accessionId, revision, objects: mediaObjects } = mediaCheck.media;

    const verified = await verifyR2Objects(
      mediaObjects.map((obj) => ({
        key: obj.key,
        contentType: obj.contentType,
        contentLength: obj.contentLength,
      })),
    );
    if (!verified.ok) {
      const detail = verified.results
        .filter((r) => !r.ok)
        .map((r) => `${r.key}: ${r.error ?? "failed"}`)
        .join("; ");
      return NextResponse.json(
        {
          error: `R2 verification failed before metadata commit. ${detail}`,
          results: verified.results,
        },
        { status: 400 },
      );
    }

    if (useWorker) {
      const row =
        (body.artworkId
          ? await findWorkerArtworkByDraftOrSlug({
              accessionId,
              draftId,
              slug,
            })
          : await findWorkerArtworkByDraftOrSlug({
              draftId,
              slug,
              accessionId,
            })) ??
        (await findWorkerArtworkByDraftOrSlug({
          draftId,
          slug,
          accessionId,
        }));

      if (!row) {
        return NextResponse.json(
          { error: "Worker artwork not found for metadata commit" },
          { status: 404 },
        );
      }

      if (body.artwork || body.provenance || body.export) {
        await updateDraftViaWorker(row.draftId, {
          slug,
          artwork: body.artwork,
          provenance: body.provenance as AccessionDraft["provenance"],
          export: body.export as AccessionDraft["export"],
        });
      } else if (body.metadata || body.perception || body.provenance) {
        await workerPatchArtwork(row.id, {
          metadata: body.metadata,
          perception: body.perception,
          export: body.export,
          provenance: body.provenance,
          slug,
        });
      } else {
        await workerPatchArtwork(row.id, { slug });
      }

      try {
        await workerMarkReady(row.id);
      } catch (e) {
        if (!(e instanceof ArchiveWorkerError && e.status === 409)) {
          throw e;
        }
      }

      let published = false;
      if (body.publish !== false) {
        const result = await workerPublish(row.id);
        published = result.artwork.status === "published";
      }

      return NextResponse.json({
        commitSha: `d1:${row.id}:${revision}`,
        paths: [`worker:artworks/${row.id}`],
        slug,
        draftId: row.draftId,
        accessionId,
        revision,
        verifiedObjects: mediaObjects.length,
        published,
        source: "worker",
        message,
      });
    }

    const upserts = textFiles.map((file) => ({
      path: normalizeMetadataCommitPath(file.path),
      content: Buffer.from(file.content, "utf8"),
    }));

    try {
      assertAllowedMetadataCommitPaths(
        upserts.map((f) => f.path),
        { slug, draftId },
      );
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Illegal metadata-commit paths";
      return NextResponse.json({ error: messageText }, { status: 400 });
    }

    const result = await commitFiles({ message, upserts });
    return NextResponse.json({
      commitSha: result.commitSha,
      paths: result.paths,
      slug,
      draftId: draftId ?? null,
      accessionId,
      revision,
      verifiedObjects: mediaObjects.length,
    });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "metadata-commit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
