import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { buildHtmlPackageFromPublishedDetail } from "@/lib/archive/html-package-from-r2";
import {
  ArchiveWorkerError,
  workerGetArtwork,
} from "@/lib/archive/worker-client";
import { preferArchiveWorker } from "@/lib/archive/worker-config";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!preferArchiveWorker()) {
    return NextResponse.json(
      {
        error:
          "Archive Worker is required for HTML package download from published revisions",
      },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  try {
    const detail = await workerGetArtwork(id);
    const pack = await buildHtmlPackageFromPublishedDetail(detail);
    return new NextResponse(new Uint8Array(pack.zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(pack.zip.byteLength),
        "content-disposition": `attachment; filename="${pack.filename}"`,
        "cache-control": "private, no-store",
        "x-accession-id": pack.accessionId,
        "x-slug": pack.slug,
        "x-published-revision": String(pack.revision),
      },
    });
  } catch (err) {
    if (err instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    const message =
      err instanceof Error ? err.message : "HTML package build failed";
    return NextResponse.json(
      { error: message },
      { status: Number.isFinite(status) && status >= 400 ? status : 500 },
    );
  }
}
