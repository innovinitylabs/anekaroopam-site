import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  githubStorageAvailable,
  loadAccessionDraftDurable,
  loadArchiveEntryDurable,
  updateAccessionDraftOnGitHub,
} from "@/lib/archive/draft-github-store";
import { updateAccessionDraft } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { AccessionDraftUpdateSchema } from "@/lib/archive/schema";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  loadDraftViaWorker,
  updateDraftViaWorker,
} from "@/lib/archive/worker-drafts";
import { ArchiveWorkerError } from "@/lib/archive/worker-client";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function GET(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  const { draftId } = await params;
  try {
    if (preferArchiveWorker()) {
      const draft = await loadDraftViaWorker(draftId);
      if (!draft) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      return NextResponse.json({
        draft,
        archiveStatus: draft.status === "published" ? "published" : null,
        source: "worker",
      });
    }

    const draft = await loadAccessionDraftDurable(draftId);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const archiveEntry = await loadArchiveEntryDurable(draft.slug);
    return NextResponse.json({
      draft,
      archiveStatus: archiveEntry?.status ?? null,
    });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Draft load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { draftId } = await params;
    const body = (await request.json()) as unknown;
    const patch = AccessionDraftUpdateSchema.parse(body);

    if (preferArchiveWorker()) {
      const draft = await updateDraftViaWorker(draftId, {
        slug: patch.slug,
        artwork: patch.artwork,
        provenance: patch.provenance,
        export: patch.export,
      });
      return NextResponse.json({ draft, source: "worker" });
    }

    const draft = githubStorageAvailable()
      ? await updateAccessionDraftOnGitHub(draftId, patch)
      : await updateAccessionDraft(draftId, patch);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Draft update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
