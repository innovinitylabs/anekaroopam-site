import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  ArchiveSyncIncompleteError,
  ArchiveSyncNotFoundError,
  syncArchiveEntryToGitHub,
} from "@/lib/github/publish-entry";
import { getGitHubArchiveConfig } from "@/lib/github/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
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
    const { slug } = await params;
    const result = await syncArchiveEntryToGitHub(slug);
    return NextResponse.json({
      slug,
      commitSha: result.commitSha,
      paths: result.paths,
    });
  } catch (e) {
    if (e instanceof ArchiveSyncNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    if (e instanceof ArchiveSyncIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Archive sync failed";
    if (message.includes("Slug is reserved") || message.includes("Slug cannot be empty")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
