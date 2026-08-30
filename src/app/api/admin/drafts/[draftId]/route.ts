import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  loadAccessionDraft,
  updateAccessionDraft,
} from "@/lib/archive/draft-store";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { AccessionDraftUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function GET(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  const { draftId } = await params;
  const draft = await loadAccessionDraft(draftId);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const archiveEntry = await loadArchiveEntry(draft.slug);
  return NextResponse.json({
    draft,
    archiveStatus: archiveEntry?.status ?? null,
  });
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { draftId } = await params;
    const body = (await request.json()) as unknown;
    const patch = AccessionDraftUpdateSchema.parse(body);
    const draft = await updateAccessionDraft(draftId, patch);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
