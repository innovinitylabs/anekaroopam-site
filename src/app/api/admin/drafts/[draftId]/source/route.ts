import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { storeDraftSource } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { draftId } = await params;
    const form = await request.formData();
    const source = form.get("source");
    if (!(source instanceof File)) {
      return NextResponse.json({ error: "Missing source file" }, { status: 400 });
    }

    const draft = await storeDraftSource(draftId, source);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Source upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
