import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ArchiveWorkerError,
  roleFromObjectKey,
  toWorkerAssetRole,
  workerRegisterAsset,
} from "@/lib/archive/worker-client";
import { findWorkerArtworkByDraftOrSlug } from "@/lib/archive/worker-drafts";
import { r2ArchiveReady } from "@/lib/r2/config";
import {
  getR2KeyPrefixFromEnv,
  isAllowedArchiveObjectKey,
} from "@/lib/r2/object-keys";
import { verifyR2Objects } from "@/lib/r2/verify";

export const runtime = "nodejs";

interface VerifyBody {
  accessionId?: string;
  revision?: number;
  artworkId?: string;
  draftId?: string;
  objects?: Array<{
    key: string;
    contentType: string;
    contentLength: number;
    width?: number;
    height?: number;
    role?: string;
  }>;
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!r2ArchiveReady()) {
    return NextResponse.json(
      { error: "R2 archive storage is not enabled or configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as VerifyBody;
    const accessionId = String(body.accessionId ?? "").trim();
    const revision = Number(body.revision);
    const objects = body.objects ?? [];

    if (!accessionId || !Number.isInteger(revision) || revision < 1) {
      return NextResponse.json(
        { error: "accessionId and revision are required" },
        { status: 400 },
      );
    }
    if (objects.length < 1 || objects.length > 16) {
      return NextResponse.json(
        { error: "objects must contain 1–16 entries" },
        { status: 400 },
      );
    }

    for (const obj of objects) {
      if (
        !isAllowedArchiveObjectKey(
          obj.key,
          accessionId,
          revision,
          getR2KeyPrefixFromEnv(),
        )
      ) {
        return NextResponse.json(
          { error: `Unauthorized object key: ${obj.key}` },
          { status: 400 },
        );
      }
    }

    const result = await verifyR2Objects(objects);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          results: result.results,
          error: "One or more uploaded objects failed verification",
        },
        { status: 400 },
      );
    }

    const registered: Array<{ role: string; objectKey: string }> = [];
    if (preferArchiveWorker()) {
      let artworkId = body.artworkId?.trim() || null;
      if (!artworkId) {
        const row = await findWorkerArtworkByDraftOrSlug({
          draftId: body.draftId?.trim(),
          accessionId,
        });
        artworkId = row?.id ?? null;
      }
      if (!artworkId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Verified in R2 but no Worker artworkId/draftId to register assets",
            results: result.results,
          },
          { status: 409 },
        );
      }

      for (const obj of objects) {
        const roleRaw =
          obj.role || roleFromObjectKey(obj.key) || "prepared";
        const role = toWorkerAssetRole(roleRaw);
        await workerRegisterAsset(artworkId, {
          role,
          objectKey: obj.key,
          mimeType: obj.contentType,
          byteSize: obj.contentLength,
          width: obj.width,
          height: obj.height,
          verified: true,
        });
        registered.push({ role, objectKey: obj.key });
      }
    }

    return NextResponse.json({
      ok: true,
      results: result.results,
      registered,
      source: preferArchiveWorker() ? "worker" : "r2-only",
    });
  } catch (e) {
    if (e instanceof ArchiveWorkerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "upload-verify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
