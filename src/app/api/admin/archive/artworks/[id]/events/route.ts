import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ArchiveWorkerError,
  workerListEvents,
  workerAppendEvent,
} from "@/lib/archive/worker-client";
import { findWorkerArtworkByDraftOrSlug } from "@/lib/archive/worker-drafts";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function resolveArtworkId(id: string): Promise<string | null> {
  const direct = id.trim();
  if (!direct) return null;
  // UUID-ish or known surrogate — try as-is via events list; else look up.
  const row = await findWorkerArtworkByDraftOrSlug({
    draftId: direct,
    slug: direct,
    accessionId: direct,
  });
  return row?.id ?? (/^[0-9a-f-]{36}$/i.test(direct) ? direct : null);
}

export async function GET(request: Request, { params }: Context) {
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
    const artworkId = await resolveArtworkId(id);
    if (!artworkId) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }
    const { events } = await workerListEvents(artworkId);
    return NextResponse.json({ artworkId, events });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "events list failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const artworkId = await resolveArtworkId(id);
    if (!artworkId) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }
    const body = (await request.json()) as {
      eventType?: string;
      payload?: unknown;
    };
    if (!body.eventType?.trim()) {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    await workerAppendEvent(artworkId, body.eventType.trim(), body.payload);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "events append failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
