import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { prepareAccessionDraft } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function POST(_request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { draftId } = await params;
    const draft = await prepareAccessionDraft(draftId);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preparation failed";
    const status = message.startsWith("source_required") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
