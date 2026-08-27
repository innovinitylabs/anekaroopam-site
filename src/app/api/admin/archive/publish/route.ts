import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { publishArchiveEntryToGitHub } from "@/lib/github/publish-entry";
import { getGitHubArchiveConfig } from "@/lib/github/types";
import { markArchiveRecordPublished, updateDraftStatus } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
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
    const entry = await markArchiveRecordPublished(slug);
    const result = await publishArchiveEntryToGitHub(entry.slug);
    if (body.draftId) {
      await updateDraftStatus(body.draftId, "published");
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
