import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import {
  loadAccessionDraft,
  updateAccessionDraft,
} from "@/lib/archive/draft-store";
import { AccessionDraftUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  const { draftId } = await params;
  const draft = await loadAccessionDraft(draftId);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  return NextResponse.json({ draft });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

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
