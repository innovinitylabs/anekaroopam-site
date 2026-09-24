import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  ArchiveWorkerError,
  workerValidateIdentity,
} from "@/lib/archive/worker-client";
import { preferArchiveWorker } from "@/lib/archive/worker-config";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!preferArchiveWorker()) {
    return NextResponse.json(
      { error: "Archive Worker is required for identity validation" },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { slug?: string };
  try {
    const result = await workerValidateIdentity(id, { slug: body.slug });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof ArchiveWorkerError) {
      if (
        err.body &&
        typeof err.body === "object" &&
        "ok" in (err.body as object)
      ) {
        return NextResponse.json(err.body, { status: err.status });
      }
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 },
    );
  }
}
