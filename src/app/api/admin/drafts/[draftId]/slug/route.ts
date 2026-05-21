import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { updateDraftSlug } from "@/lib/archive/draft-store";
import { SlugUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { draftId } = await params;
    const input = SlugUpdateSchema.parse(await request.json());
    const draft = await updateDraftSlug(draftId, input);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Slug update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
