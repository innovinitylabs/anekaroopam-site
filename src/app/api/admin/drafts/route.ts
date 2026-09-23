import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  createAccessionDraftOnGitHub,
  githubStorageAvailable,
  listAccessionDraftsDurable,
} from "@/lib/archive/draft-github-store";
import { createAccessionDraft } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { CreateAccessionDraftSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const drafts = await listAccessionDraftsDurable();
    return NextResponse.json({ drafts });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Failed to list drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const input = CreateAccessionDraftSchema.parse(body);
    const draft = githubStorageAvailable()
      ? await createAccessionDraftOnGitHub(input)
      : await createAccessionDraft(input);
    return NextResponse.json({ draft });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Draft creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
