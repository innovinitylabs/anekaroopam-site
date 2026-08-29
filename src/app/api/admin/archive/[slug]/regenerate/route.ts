import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  hydrateDraftFromArchiveSlug,
  regeneratePublishedEntryFromDraft,
} from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const draft = await hydrateDraftFromArchiveSlug(slug);
    const result = await regeneratePublishedEntryFromDraft(draft.draftId);
    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Regeneration failed";
    const status = message.startsWith("source_required") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
