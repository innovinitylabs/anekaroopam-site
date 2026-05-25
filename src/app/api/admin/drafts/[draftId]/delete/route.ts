import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { deleteDraft } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

const DeleteDraftBodySchema = z.object({
  confirmation: z.string(),
});

type Context = { params: Promise<{ draftId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { draftId } = await params;
    const body = DeleteDraftBodySchema.parse(await request.json());
    await deleteDraft(draftId, body.confirmation);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft deletion failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
