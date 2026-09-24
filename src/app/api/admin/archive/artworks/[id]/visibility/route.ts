import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ArchiveWorkerError,
  workerSetVisibility,
  workerUnpublish,
} from "@/lib/archive/worker-client";
import { findWorkerArtworkByDraftOrSlug } from "@/lib/archive/worker-drafts";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;
  if (!preferArchiveWorker()) {
    return NextResponse.json(
      { error: "Archive Worker not configured" },
      { status: 503 },
    );
  }

  try {
    const { id } = await params;
    const row = await findWorkerArtworkByDraftOrSlug({
      draftId: id,
      slug: id,
      accessionId: id,
    });
    const artworkId = row?.id ?? (/^[0-9a-f-]{36}$/i.test(id) ? id : null);
    if (!artworkId) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      action?: "unpublish" | "hide" | "withdraw" | "restore";
      status?: "hidden" | "withdrawn" | "published" | "ready";
    };

    if (body.action === "unpublish") {
      const result = await workerUnpublish(artworkId);
      return NextResponse.json({ artwork: result });
    }

    const status =
      body.status ??
      (body.action === "hide"
        ? "hidden"
        : body.action === "withdraw"
          ? "withdrawn"
          : body.action === "restore"
            ? "published"
            : null);
    if (!status) {
      return NextResponse.json(
        { error: "action or status required" },
        { status: 400 },
      );
    }
    const result = await workerSetVisibility(artworkId, status);
    return NextResponse.json({ artwork: result });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "visibility update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
