import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  ArchiveWorkerError,
  workerDeleteArtwork,
} from "@/lib/archive/worker-client";
import { preferArchiveWorker } from "@/lib/archive/worker-config";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!preferArchiveWorker()) {
    return NextResponse.json(
      { error: "Archive Worker is required for delete" },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  try {
    const result = await workerDeleteArtwork(id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ArchiveWorkerError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 },
    );
  }
}
