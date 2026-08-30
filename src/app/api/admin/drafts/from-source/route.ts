import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { createAccessionDraftFromSource } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const source = form.get("source");
    if (!(source instanceof File)) {
      return NextResponse.json({ error: "Missing source file" }, { status: 400 });
    }

    const draft = await createAccessionDraftFromSource(source);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft creation from source failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
