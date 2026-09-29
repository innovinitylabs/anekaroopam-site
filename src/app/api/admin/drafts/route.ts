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
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  createDraftViaWorker,
  listDraftsViaWorker,
} from "@/lib/archive/worker-drafts";
import { ArchiveWorkerError } from "@/lib/archive/worker-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    if (preferArchiveWorker()) {
      const drafts = await listDraftsViaWorker();
      return NextResponse.json({ drafts, source: "worker" });
    }
    const drafts = await listAccessionDraftsDurable();
    return NextResponse.json({ drafts });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
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
    if (preferArchiveWorker()) {
      const draft = await createDraftViaWorker(input);
      return NextResponse.json({ draft, source: "worker" }, { status: 201 });
    }
    const draft = githubStorageAvailable()
      ? await createAccessionDraftOnGitHub(input)
      : await createAccessionDraft(input);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Draft creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
