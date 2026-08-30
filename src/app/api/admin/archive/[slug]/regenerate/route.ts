import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  hydrateDraftFromArchiveSlug,
  regeneratePublishedEntryFromDraft,
} from "@/lib/archive/draft-store";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
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
    const entry = await loadArchiveEntry(slug);
    if (!entry) {
      return NextResponse.json(
        { error: `Archive entry not found: ${slug}` },
        { status: 404 },
      );
    }
    assertArchiveRegenerable(entry);

    const draft = await hydrateDraftFromArchiveSlug(slug);
    const result = await regeneratePublishedEntryFromDraft(draft.draftId);
    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Regeneration failed";
    return NextResponse.json(
      { error: message },
      { status: regenerateErrorStatus(message) },
    );
  }
}
