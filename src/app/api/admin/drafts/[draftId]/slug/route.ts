import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { updateDraftSlug } from "@/lib/archive/draft-store";
import { SlugUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

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
