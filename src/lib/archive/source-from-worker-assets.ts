/**
 * Map Worker working-tip assets into AccessionDraft source/processing fields.
 * Canonical editable master is role "original" only.
 */

import type { DraftProcessing, DraftSource } from "./schema";
import type { WorkerArtworkDetail } from "./worker-client";
import { publicUrlForR2Key } from "@/lib/r2/public-url";

export type WorkerAssetRow = WorkerArtworkDetail["assets"][number];

const PREVIEW_ROLES = ["artwork", "preview", "preview_webp", "thumb"] as const;

export function filenameFromObjectKey(objectKey: string): string {
  const parts = objectKey.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "original.bin";
}

export function findAssetByRole(
  assets: WorkerAssetRow[],
  role: string,
): WorkerAssetRow | undefined {
  return assets.find((a) => a.role === role);
}

export function mapSourceFromWorkerAssets(
  assets: WorkerAssetRow[],
): DraftSource {
  const original = findAssetByRole(assets, "original");
  if (!original) {
    return { kind: "migration-required" };
  }
  return {
    kind: "original",
    originalFilename: filenameFromObjectKey(original.object_key),
    storedFilename: filenameFromObjectKey(original.object_key),
    mimeType: original.mime_type,
    byteSize: original.byte_size,
  };
}

export function mapProcessingFromWorkerAssets(
  assets: WorkerAssetRow[],
): DraftProcessing {
  const prepared = findAssetByRole(assets, "prepared");
  if (!prepared) return {};
  return {
    preparedSource: filenameFromObjectKey(prepared.object_key),
    preparedAt: prepared.verified_at ?? undefined,
  };
}

/** Preview URL for UI only — never use as editable master. */
export function previewImageSrcFromWorkerAssets(
  assets: WorkerAssetRow[],
  publicBaseUrl: string | null | undefined,
): string {
  if (!publicBaseUrl?.trim()) return "";
  for (const role of PREVIEW_ROLES) {
    const asset = findAssetByRole(assets, role);
    if (asset?.object_key) {
      try {
        return publicUrlForR2Key(asset.object_key, publicBaseUrl);
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function workingTipHasOriginal(assets: WorkerAssetRow[]): boolean {
  return Boolean(findAssetByRole(assets, "original"));
}
