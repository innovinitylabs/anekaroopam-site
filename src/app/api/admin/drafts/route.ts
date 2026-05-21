import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import {
  createAccessionDraft,
  listAccessionDrafts,
} from "@/lib/archive/draft-store";
import { CreateAccessionDraftSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

export async function GET() {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  const drafts = await listAccessionDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const input = CreateAccessionDraftSchema.parse(body);
    const draft = await createAccessionDraft(input);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
