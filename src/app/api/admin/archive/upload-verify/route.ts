import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  ArchiveWorkerError,
  roleFromObjectKey,
  toWorkerAssetRole,
  workerRegisterAsset,
} from "@/lib/archive/worker-client";
import { resolveWorkerArtworkForWrite } from "@/lib/archive/worker-drafts";
import { r2ArchiveReady } from "@/lib/r2/config";
import { resolveR2Namespace } from "@/lib/r2/namespace";
import { isAllowedArchiveObjectKey } from "@/lib/r2/object-keys";
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
  const namespace = resolveR2Namespace();
  if (!namespace.ok) {
    return NextResponse.json({ error: namespace.error }, { status: 503 });
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
          namespace.prefix,
        )
      ) {
        return NextResponse.json(
          { error: `Unauthorized object key: ${obj.key}` },
          { status: 400 },
        );
      }
    }

    let artworkId: string | null = null;
    if (preferArchiveWorker()) {
      if (!body.artworkId?.trim() && !body.draftId?.trim()) {
        return NextResponse.json(
          { error: "artworkId or draftId is required to register assets" },
          { status: 400 },
        );
      }
      const artwork = await resolveWorkerArtworkForWrite({
        artworkId: body.artworkId,
        draftId: body.draftId,
        accessionId,
      });
      if (artwork.workingRevision !== revision) {
        return NextResponse.json(
          {
            error: `Revision r${revision} is not the working revision (r${artwork.workingRevision}) of ${artwork.accessionId}`,
          },
          { status: 409 },
        );
      }
      artworkId = artwork.id;
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
    if (artworkId) {
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
