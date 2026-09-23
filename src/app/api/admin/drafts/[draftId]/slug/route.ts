import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  githubStorageAvailable,
  updateDraftSlugOnGitHub,
} from "@/lib/archive/draft-github-store";
import { updateDraftSlug } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { SlugUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { draftId } = await params;
    const input = SlugUpdateSchema.parse(await request.json());
    const draft = githubStorageAvailable()
      ? await updateDraftSlugOnGitHub(draftId, input)
      : await updateDraftSlug(draftId, input);
    return NextResponse.json({ draft });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Slug update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
