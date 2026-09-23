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
        /* metadata tip update best-effort after bundle push */
      }
    }

    if (body.draftId) {
      try {
        await updateDraftStatusOnGitHub(body.draftId, "published");
      } catch {
        await updateDraftStatus(body.draftId, "published");
      }
    }

    return NextResponse.json({ commitSha, paths });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    if (e instanceof ArchiveSyncNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    if (e instanceof ArchiveSyncIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Publish failed";
    if (
      message.includes("hidden and cannot be published") ||
      message.includes("withdrawn and cannot be published")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
