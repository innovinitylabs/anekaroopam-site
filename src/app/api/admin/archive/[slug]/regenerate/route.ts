import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { regenerateArchiveSlugOnGitHub } from "@/lib/archive/draft-github-generate";
import {
  githubStorageAvailable,
  loadArchiveEntryDurable,
} from "@/lib/archive/draft-github-store";
import {
  hydrateDraftFromArchiveSlug,
  regeneratePublishedEntryFromDraft,
} from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { assertArchiveRegenerable } from "@/lib/archive/visibility";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

function regenerateErrorStatus(message: string): number {
  if (
    message.startsWith("source_required") ||
    message.includes("withdrawn and cannot be regenerated")
  ) {
    return 409;
  }
  if (message.includes("Archive entry not found")) {
    return 404;
  }
  return 500;
}

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const entry = await loadArchiveEntryDurable(slug);
    if (!entry) {
      return NextResponse.json(
        { error: `Archive entry not found: ${slug}` },
        { status: 404 },
      );
    }
    assertArchiveRegenerable(entry);

    const result = githubStorageAvailable()
      ? await regenerateArchiveSlugOnGitHub(entry.slug)
      : await (async () => {
          const draft = await hydrateDraftFromArchiveSlug(entry.slug);
          return regeneratePublishedEntryFromDraft(draft.draftId);
        })();
    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Regeneration failed";
    return NextResponse.json(
      { error: message },
      { status: regenerateErrorStatus(message) },
    );
  }
}
