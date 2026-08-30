import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { markArchiveRecordPublished, updateDraftStatus } from "@/lib/archive/draft-store";
import { assertArchivePublishable } from "@/lib/archive/visibility";
import {
  ArchiveSyncIncompleteError,
  ArchiveSyncNotFoundError,
  publishArchiveEntryToGitHub,
  validateArchiveBundleForSync,
} from "@/lib/github/publish-entry";
import { getGitHubArchiveConfig } from "@/lib/github/types";

export const runtime = "nodejs";

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
    const entry = await loadArchiveEntry(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }

    assertArchivePublishable(entry);
    await validateArchiveBundleForSync(entry.slug);

    const result = await publishArchiveEntryToGitHub(entry.slug);
    await markArchiveRecordPublished(entry.slug);
    if (body.draftId) {
      await updateDraftStatus(body.draftId, "published");
    }
    return NextResponse.json(result);
  } catch (e) {
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
