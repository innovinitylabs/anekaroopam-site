import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { performPermanentArtworkDelete } from "@/lib/archive/artwork-delete";
import {
  workerDeleteArtwork,
  workerGetArtwork,
  workerListOwnedAssets,
} from "@/lib/archive/worker-client";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import { getR2KeyPrefixFromEnv } from "@/lib/r2/object-keys";
import { deleteR2Objects } from "@/lib/r2/delete-objects";
import { getR2Config } from "@/lib/r2/config";

export const runtime = "nodejs";

async function readConfirm(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("confirm");
  if (fromQuery) return fromQuery;
  try {
    const body = (await request.clone().json()) as { confirm?: string };
    return body.confirm ?? null;
  } catch {
    return null;
  }
}

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
  const confirm = await readConfirm(request);

  const outcome = await performPermanentArtworkDelete(id, confirm, {
    keyPrefix: getR2KeyPrefixFromEnv(),
    hasR2Config: () => Boolean(getR2Config()),
    async getArtwork(artworkId) {
      const detail = await workerGetArtwork(artworkId);
      const artwork = detail.artwork;
      return {
        id: artwork.id,
        status: artwork.status,
        publishedRevision: artwork.publishedRevision,
        publishedAt: artwork.publishedAt,
        accessionId: artwork.accessionId,
      };
    },
    async listOwnedAssets(artworkId) {
      const owned = await workerListOwnedAssets(artworkId);
      return owned.assets;
    },
    deleteR2Objects,
    deleteD1Artwork: workerDeleteArtwork,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: outcome.error,
        ...(outcome.deletedKeys ? { deletedKeys: outcome.deletedKeys } : {}),
        ...(outcome.failedKeys ? { failedKeys: outcome.failedKeys } : {}),
        ...(outcome.keys ? { keys: outcome.keys } : {}),
      },
      { status: outcome.status },
    );
  }

  return NextResponse.json({
    deleted: true,
    id: outcome.id,
    r2Deleted: outcome.r2Deleted,
    assetIdsRemoved: outcome.assetIdsRemoved,
  });
}
