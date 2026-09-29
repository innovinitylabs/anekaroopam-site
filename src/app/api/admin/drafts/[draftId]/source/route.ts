import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  githubStorageAvailable,
  storeDraftSourceOnGitHub,
} from "@/lib/archive/draft-github-store";
import { storeDraftSource } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";

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

    const draft = githubStorageAvailable()
      ? await storeDraftSourceOnGitHub(draftId, source)
      : await storeDraftSource(draftId, source);
    return NextResponse.json({ draft });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Source upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
