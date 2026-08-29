import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { deleteDraft } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

const DeleteDraftBodySchema = z.object({
  confirmation: z.string(),
});

type Context = { params: Promise<{ draftId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

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
