import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  githubStorageAvailable,
  prepareAccessionDraftOnGitHub,
} from "@/lib/archive/draft-github-store";
import { prepareAccessionDraft } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { draftId } = await params;
    const draft = githubStorageAvailable()
      ? await prepareAccessionDraftOnGitHub(draftId)
      : await prepareAccessionDraft(draftId);
    return NextResponse.json({ draft });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Preparation failed";
    const status = message.startsWith("source_required") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
