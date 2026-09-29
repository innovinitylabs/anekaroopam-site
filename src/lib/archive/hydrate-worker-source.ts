/**
 * Client helpers to hydrate original/prepared assets via the admin R2 proxy.
 */

import { adminFetch } from "@/components/admin/admin-fetch";
import type { LocalPreparedMaster } from "@/lib/archive/browser-durable-commit";
import {
  isSourceWithinLimit,
  sourceOverLimitMessage,
} from "@/lib/archive/commit-bundle-limits";

export type HydratedSource = {
  file: File;
  artworkId: string;
  objectKey: string;
};

export type HydrateSourceError = {
  status: number;
  message: string;
};

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    /* ignore */
  }
  return `Source hydration failed (${res.status})`;
}

export async function fetchWorkerAssetRole(
  artworkIdOrDraftId: string,
  role: "original" | "prepared",
): Promise<
  | { ok: true; blob: Blob; filename: string; mimeType: string; width: number | null; height: number | null; objectKey: string }
  | { ok: false; error: HydrateSourceError }
> {
  const res = await adminFetch(
    `/api/admin/archive/artworks/${encodeURIComponent(artworkIdOrDraftId)}/source?role=${role}`,
  );
  if (!res.ok) {
    return {
      ok: false,
      error: { status: res.status, message: await readErrorMessage(res) },
    };
  }
  const blob = await res.blob();
  const filename =
    res.headers.get("x-filename") ||
    (role === "original" ? "original.bin" : "prepared.avif");
  const mimeType =
    res.headers.get("content-type") || blob.type || "application/octet-stream";
  const widthRaw = res.headers.get("x-width");
  const heightRaw = res.headers.get("x-height");
  return {
    ok: true,
    blob,
    filename,
    mimeType,
    width: widthRaw ? Number(widthRaw) : null,
    height: heightRaw ? Number(heightRaw) : null,
    objectKey: res.headers.get("x-object-key") || "",
  };
}

export async function hydrateOriginalFile(
  artworkIdOrDraftId: string,
): Promise<HydratedSource | { error: HydrateSourceError }> {
  const result = await fetchWorkerAssetRole(artworkIdOrDraftId, "original");
  if (!result.ok) return { error: result.error };
  if (!isSourceWithinLimit(result.blob.size)) {
    return {
      error: {
        status: 413,
        message: sourceOverLimitMessage(result.blob.size),
      },
    };
  }
  const file = new File([result.blob], result.filename, {
    type: result.mimeType,
  });
  return {
    file,
    artworkId: artworkIdOrDraftId,
    objectKey: result.objectKey,
  };
}

export async function hydratePreparedLocal(
  artworkIdOrDraftId: string,
): Promise<LocalPreparedMaster | { error: HydrateSourceError }> {
  const result = await fetchWorkerAssetRole(artworkIdOrDraftId, "prepared");
  if (!result.ok) return { error: result.error };
  const objectUrl = URL.createObjectURL(result.blob);
  return {
    blob: result.blob,
    width: result.width && result.width > 0 ? result.width : 1,
    height: result.height && result.height > 0 ? result.height : 1,
    objectUrl,
    preparedAt: new Date().toISOString(),
  };
}
