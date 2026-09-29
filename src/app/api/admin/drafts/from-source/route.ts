import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  createAccessionDraftFromSourceOnGitHub,
  githubStorageAvailable,
} from "@/lib/archive/draft-github-store";
import { createAccessionDraftFromSource } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";

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

    const draft = githubStorageAvailable()
      ? await createAccessionDraftFromSourceOnGitHub(source)
      : await createAccessionDraftFromSource(source);
    return NextResponse.json({ draft });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Draft creation from source failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
