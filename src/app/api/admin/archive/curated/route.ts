import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/archive/admin-guard";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { isCuratedSlug, loadCuratedVisibility } from "@/lib/archive/curated";
import {
  ArchiveWorkerError,
  workerSetCuratedVisibility,
} from "@/lib/archive/worker-client";
import { preferArchiveWorker } from "@/lib/archive/worker-config";

export const runtime = "nodejs";

function workerRequired(): NextResponse {
  return NextResponse.json(
    { error: "Curated visibility requires the Archive Worker" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;
  if (!preferArchiveWorker()) return workerRequired();

  const visibility = await loadCuratedVisibility();
  if (!visibility.known) {
    return NextResponse.json(
      { error: `Curated visibility unavailable: ${visibility.reason}` },
      { status: 503 },
    );
  }
  return NextResponse.json({ entries: visibility.entries });
}

export async function PUT(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;
  if (!preferArchiveWorker()) return workerRequired();

  const body = (await request.json().catch(() => ({}))) as {
    slug?: unknown;
    visible?: unknown;
  };
  if (typeof body.slug !== "string" || !isCuratedSlug(body.slug)) {
    return NextResponse.json({ error: "Unknown curated work" }, { status: 400 });
  }
  if (typeof body.visible !== "boolean") {
    return NextResponse.json(
      { error: "visible (boolean) required" },
      { status: 400 },
    );
  }

  try {
    const { entry } = await workerSetCuratedVisibility(
      body.slug,
      body.visible,
      readAdminSession(request)?.login,
    );
    return NextResponse.json({ entry });
  } catch (err) {
    if (err instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}
