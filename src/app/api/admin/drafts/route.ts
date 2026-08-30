import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  createAccessionDraft,
  listAccessionDrafts,
} from "@/lib/archive/draft-store";
import { CreateAccessionDraftSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  const drafts = await listAccessionDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

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
