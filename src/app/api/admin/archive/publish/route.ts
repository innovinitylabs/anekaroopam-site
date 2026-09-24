import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  loadArchiveEntryDurable,
  markArchiveRecordPublishedOnGitHub,
  updateDraftStatusOnGitHub,
} from "@/lib/archive/draft-github-store";
import {
  markArchiveRecordPublished,
  updateDraftStatus,
} from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { assertArchivePublishable } from "@/lib/archive/visibility";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ArchiveWorkerError,
  workerPublish,
} from "@/lib/archive/worker-client";
import { findWorkerArtworkByDraftOrSlug } from "@/lib/archive/worker-drafts";
import {
  ArchiveSyncIncompleteError,
  ArchiveSyncNotFoundError,
  publishArchiveEntryToGitHub,
  validateArchiveBundleForSync,
  validateArchiveBundleOnGitHub,
} from "@/lib/github/publish-entry";
import { getGitHubArchiveConfig } from "@/lib/github/types";

export const runtime = "nodejs";

async function githubBundleReady(slug: string): Promise<boolean> {
  try {
    await validateArchiveBundleOnGitHub(slug);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (preferArchiveWorker()) {
    try {
      const body = (await request.json()) as {
        slug?: string;
        draftId?: string;
        artworkId?: string;
        revision?: number;
      };
      const slug = body.slug?.trim();
      if (!slug && !body.draftId && !body.artworkId) {
        return NextResponse.json(
          { error: "slug, draftId, or artworkId required" },
          { status: 400 },
        );
      }
      const row = body.artworkId
        ? { id: body.artworkId }
        : await findWorkerArtworkByDraftOrSlug({
            draftId: body.draftId?.trim(),
            slug,
          });
      if (!row) {
        return NextResponse.json(
          { error: "Artwork not found in Worker" },
          { status: 404 },
        );
      }
      const result = await workerPublish(row.id, body.revision);
      return NextResponse.json({
        ok: true,
        source: "worker",
        artwork: result.artwork,
      });
    } catch (e) {
      if (e instanceof ArchiveWorkerError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      const message = e instanceof Error ? e.message : "publish failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!getGitHubArchiveConfig()) {
    return NextResponse.json(
      {
        error:
          "GitHub not configured. Set GITHUB_ARCHIVE_TOKEN, GITHUB_ARCHIVE_OWNER, and GITHUB_ARCHIVE_REPO.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { slug?: string; draftId?: string };
    if (!body.slug?.trim()) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const slug = body.slug.trim();
    const entry = await loadArchiveEntryDurable(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }

    assertArchivePublishable(entry);

    let commitSha: string | undefined;
    let paths: string[] = [];

    if (await githubBundleReady(entry.slug)) {
      const published = await markArchiveRecordPublishedOnGitHub(entry.slug);
      commitSha = published.commitSha || undefined;
      paths = [`content/archive/${published.entry.slug}/metadata.json`];
      try {
        await markArchiveRecordPublished(entry.slug);
      } catch {
        /* local mirror optional once GitHub is authoritative */
      }
    } else {
      await validateArchiveBundleForSync(entry.slug);
      const result = await publishArchiveEntryToGitHub(entry.slug);
      commitSha = result.commitSha;
      paths = result.paths;
      await markArchiveRecordPublished(entry.slug);
      try {
        await markArchiveRecordPublishedOnGitHub(entry.slug);
      } catch {
        /* optional */
      }
    }

    if (body.draftId) {
      try {
        await updateDraftStatusOnGitHub(body.draftId, "published");
      } catch {
        try {
          await updateDraftStatus(body.draftId, "published");
        } catch {
          /* draft status best-effort */
        }
      }
    }

    return NextResponse.json({
      ok: true,
      commitSha,
      paths,
      slug,
    });
  } catch (e) {
    if (
      e instanceof ArchiveSyncIncompleteError ||
      e instanceof ArchiveSyncNotFoundError
    ) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
