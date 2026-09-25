/**
 * Pure helpers for never-published artwork hard-delete + owned R2 cleanup.
 * Ownership is based on D1 revision_assets rows, then accession match on keys.
 */

import {
  parseAccessionRevisionFromKey,
  withoutR2KeyPrefix,
} from "@/lib/r2/object-keys";

export type OwnedAssetForDelete = {
  asset_id: string;
  role: string;
  object_key: string;
  revision: number;
};

export type R2DeleteOutcome = {
  deleted: string[];
  failed: Array<{ key: string; error: string }>;
};

export type DeletableArtworkGate = {
  status: string;
  publishedRevision: number | null;
  publishedAt: string | null;
  accessionId: string;
};

const DELETABLE_STATUSES = new Set(["draft", "uploading", "ready"]);

/** UI + server shared eligibility (never-published drafts only). */
export function canPermanentlyDeleteArtwork(
  artwork: DeletableArtworkGate,
): boolean {
  return (
    DELETABLE_STATUSES.has(artwork.status) &&
    artwork.publishedRevision == null &&
    artwork.publishedAt == null
  );
}

export function assertNeverPublishedDeletable(
  artwork: DeletableArtworkGate,
): void {
  if (!DELETABLE_STATUSES.has(artwork.status)) {
    throw Object.assign(
      new Error(`Cannot delete artwork with status "${artwork.status}"`),
      { status: 409 },
    );
  }
  if (artwork.publishedRevision != null || artwork.publishedAt != null) {
    throw Object.assign(
      new Error(
        "Cannot delete artwork that has been published; unpublish or withdraw instead",
      ),
      { status: 409 },
    );
  }
}

/**
 * Keep only assets whose object_key accession matches the artwork accession.
 * Throws if any foreign key is present (do not silently drop — abort delete).
 */
export function assertOwnedAssetKeys(
  accessionId: string,
  assets: OwnedAssetForDelete[],
  keyPrefix?: string | null,
): string[] {
  const keys: string[] = [];
  for (const asset of assets) {
    const parsed = parseAccessionRevisionFromKey(asset.object_key, keyPrefix);
    if (!parsed) {
      // Dig/test keys may not match production shape; still require prefix ownership
      // via revision_assets join. Non-archive keys are allowed only when they cannot
      // be parsed as another accession — reject if they look like archive/* for a
      // different accession.
      const logical = withoutR2KeyPrefix(asset.object_key, keyPrefix);
      if (logical.startsWith("archive/")) {
        throw Object.assign(
          new Error(
            `Owned asset key does not match accession ${accessionId}: ${asset.object_key}`,
          ),
          { status: 409 },
        );
      }
      keys.push(asset.object_key);
      continue;
    }
    if (parsed.accessionId !== accessionId) {
      throw Object.assign(
        new Error(
          `Asset key belongs to ${parsed.accessionId}, not ${accessionId}: ${asset.object_key}`,
        ),
        { status: 409 },
      );
    }
    keys.push(asset.object_key);
  }
  return [...new Set(keys)];
}

export function requirePermanentDeleteConfirm(
  confirm: string | null | undefined,
): void {
  if (confirm !== "permanent") {
    throw Object.assign(
      new Error("Delete requires confirm=permanent query or body field"),
      { status: 400 },
    );
  }
}

export type PermanentDeleteArtworkDetail = DeletableArtworkGate & {
  id: string;
};

export type PermanentDeleteDeps = {
  getArtwork: (id: string) => Promise<PermanentDeleteArtworkDetail>;
  listOwnedAssets: (artworkId: string) => Promise<OwnedAssetForDelete[]>;
  deleteR2Objects: (keys: string[]) => Promise<R2DeleteOutcome>;
  deleteD1Artwork: (artworkId: string) => Promise<{
    deleted: true;
    id: string;
    assetIdsRemoved?: string[];
  }>;
  hasR2Config: () => boolean;
  keyPrefix?: string | null;
};

export type PermanentDeleteSuccess = {
  ok: true;
  id: string;
  r2Deleted: string[];
  assetIdsRemoved?: string[];
};

export type PermanentDeleteFailure = {
  ok: false;
  status: number;
  error: string;
  deletedKeys?: string[];
  failedKeys?: R2DeleteOutcome["failed"];
  keys?: string[];
};

/**
 * Next.js orchestration: confirm → never-published → owned keys → R2 then D1.
 * Does not touch legacy FS/GitHub content.
 */
export async function performPermanentArtworkDelete(
  artworkId: string,
  confirm: string | null | undefined,
  deps: PermanentDeleteDeps,
): Promise<PermanentDeleteSuccess | PermanentDeleteFailure> {
  try {
    requirePermanentDeleteConfirm(confirm);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err instanceof Error ? err.message : "confirm required",
    };
  }

  let artwork: PermanentDeleteArtworkDetail;
  try {
    artwork = await deps.getArtwork(artworkId);
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    return {
      ok: false,
      status: Number.isFinite(status) && status >= 400 ? status : 500,
      error: err instanceof Error ? err.message : "Artwork lookup failed",
    };
  }

  try {
    assertNeverPublishedDeletable(artwork);
  } catch (err) {
    return {
      ok: false,
      status: 409,
      error: err instanceof Error ? err.message : "Not deletable",
    };
  }

  let keys: string[];
  try {
    const owned = await deps.listOwnedAssets(artwork.id);
    keys = assertOwnedAssetKeys(artwork.accessionId, owned, deps.keyPrefix);
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    return {
      ok: false,
      status: Number.isFinite(status) && status >= 400 ? status : 500,
      error:
        err instanceof Error ? err.message : "Owned asset validation failed",
    };
  }

  if (keys.length > 0) {
    if (!deps.hasR2Config()) {
      return {
        ok: false,
        status: 503,
        error:
          "R2 is not configured; cannot delete owned objects before D1 cleanup",
        keys,
      };
    }
    const r2 = await deps.deleteR2Objects(keys);
    if (r2.failed.length > 0) {
      return {
        ok: false,
        status: 502,
        error: "R2 cleanup failed; D1 record was not deleted",
        deletedKeys: r2.deleted,
        failedKeys: r2.failed,
      };
    }
  }

  try {
    const result = await deps.deleteD1Artwork(artwork.id);
    return {
      ok: true,
      id: result.id,
      r2Deleted: keys,
      assetIdsRemoved: result.assetIdsRemoved,
    };
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    return {
      ok: false,
      status: Number.isFinite(status) && status >= 400 ? status : 500,
      error: err instanceof Error ? err.message : "D1 delete failed",
      deletedKeys: keys,
    };
  }
}
