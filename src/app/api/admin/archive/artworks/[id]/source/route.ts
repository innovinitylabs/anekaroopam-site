import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { filenameFromObjectKey } from "@/lib/archive/source-from-worker-assets";
import {
  ArchiveWorkerError,
  workerGetArtwork,
} from "@/lib/archive/worker-client";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  isSourceWithinLimit,
  sourceOverLimitMessage,
} from "@/lib/archive/commit-bundle-limits";
import { getR2ClientOrNull } from "@/lib/r2/client";
import { getR2Config } from "@/lib/r2/config";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["original", "prepared"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  const { id } = await context.params;
  const role = new URL(request.url).searchParams.get("role") || "original";
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json(
      {
        error:
          'role must be "original" or "prepared"; previews cannot be used as editable source',
      },
      { status: 400 },
    );
  }

  if (!preferArchiveWorker()) {
    return NextResponse.json(
      { error: "Archive Worker is required for source hydration" },
      { status: 503 },
    );
  }

  const config = getR2Config();
  const client = getR2ClientOrNull();
  if (!config || !client) {
    return NextResponse.json(
      { error: "R2 is not configured" },
      { status: 503 },
    );
  }

  try {
    const detail = await workerGetArtwork(id);
    const asset = detail.assets.find((a) => a.role === role);
    if (!asset) {
      return NextResponse.json(
        {
          error:
            role === "original"
              ? "Server source: unavailable. No original asset on the working revision."
              : "Prepared asset is not registered on the working revision.",
        },
        { status: 404 },
      );
    }

    if (role === "original" && !isSourceWithinLimit(asset.byte_size)) {
      return NextResponse.json(
        { error: sourceOverLimitMessage(asset.byte_size) },
        { status: 413 },
      );
    }

    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: asset.object_key,
      }),
    );

    if (!result.Body) {
      return NextResponse.json(
        { error: "R2 object body was empty" },
        { status: 502 },
      );
    }

    const bytes = await result.Body.transformToByteArray();
    const filename = filenameFromObjectKey(asset.object_key);
    const contentType =
      result.ContentType || asset.mime_type || "application/octet-stream";

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
        "x-artwork-id": detail.artwork.id,
        "x-asset-role": role,
        "x-object-key": asset.object_key,
        "x-filename": filename,
        ...(asset.width != null ? { "x-width": String(asset.width) } : {}),
        ...(asset.height != null ? { "x-height": String(asset.height) } : {}),
      },
    });
  } catch (err) {
    if (err instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Source fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
