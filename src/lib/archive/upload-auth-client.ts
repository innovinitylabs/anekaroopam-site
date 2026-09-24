"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import { readAdminJson } from "@/lib/archive/admin-response";
import type { MetadataPackageFile } from "@/lib/archive/browser-metadata-package";
import type { AccessionDraft } from "@/lib/archive/schema";
import { browserPresignedPutHeaders } from "@/lib/r2/presign-headers";

export interface PresignedPutClient {
  key: string;
  url: string;
  method: "PUT";
  headers: {
    "Content-Type": string;
  };
  expiresAt: string;
  contentType: string;
  contentLength: number;
}

export interface UploadAuthObjectSpec {
  role: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface UploadAuthResponse {
  accessionId: string;
  draftId: string;
  revision: number;
  artworkId?: string | null;
  publicBaseUrl: string;
  uploads: PresignedPutClient[];
  existingEntry: unknown | null;
}

export interface MetadataCommitMediaObject {
  key: string;
  contentType: string;
  contentLength: number;
}

/** @deprecated Prefer browserPresignedPutHeaders. */
export function browserPutHeaders(contentType: string): {
  "Content-Type": string;
} {
  return browserPresignedPutHeaders(contentType);
}

export async function requestUploadAuth(input: {
  slug: string;
  draftId?: string;
  isExistingArchive: boolean;
  storedFilename: string;
  objects: UploadAuthObjectSpec[];
  retrySameRevision?: boolean;
}): Promise<UploadAuthResponse> {
  const res = await adminFetch("/api/admin/archive/upload-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const parsed = await readAdminJson<UploadAuthResponse & { error?: string }>(
    res,
  );
  if (!parsed.ok || !parsed.data.uploads?.length) {
    throw new Error(parsed.data.error ?? "upload-auth failed");
  }
  return parsed.data;
}

export async function putToPresignedUrl(
  upload: PresignedPutClient,
  blob: Blob,
): Promise<void> {
  const contentType =
    upload.headers["Content-Type"] || upload.contentType || blob.type;
  const res = await fetch(upload.url, {
    method: "PUT",
    headers: browserPresignedPutHeaders(contentType),
    body: blob,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `R2 upload failed for ${upload.key} (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
    );
  }
}

export async function verifyUploads(input: {
  accessionId: string;
  revision: number;
  artworkId?: string | null;
  draftId?: string;
  objects: Array<{
    key: string;
    contentType: string;
    contentLength: number;
    role?: string;
  }>;
}): Promise<void> {
  const res = await adminFetch("/api/admin/archive/upload-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const parsed = await readAdminJson<{
    ok?: boolean;
    error?: string;
    results?: Array<{ key: string; ok: boolean; error?: string }>;
  }>(res);
  if (!parsed.ok || !parsed.data.ok) {
    const detail =
      parsed.data.results
        ?.filter((r) => !r.ok)
        .map((r) => `${r.key}: ${r.error ?? "failed"}`)
        .join("; ") ?? parsed.data.error;
    throw new Error(detail ?? "upload-verify failed");
  }
}

export async function postMetadataCommit(input: {
  slug: string;
  draftId?: string;
  artworkId?: string | null;
  message?: string;
  textFiles: MetadataPackageFile[];
  accessionId: string;
  revision: number;
  mediaObjects: MetadataCommitMediaObject[];
  artwork?: AccessionDraft["artwork"];
  provenance?: AccessionDraft["provenance"];
  export?: AccessionDraft["export"];
  publish?: boolean;
}): Promise<{ commitSha: string; paths: string[] }> {
  const res = await adminFetch("/api/admin/archive/metadata-commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: input.slug,
      draftId: input.draftId,
      artworkId: input.artworkId,
      message: input.message,
      textFiles: input.textFiles,
      artwork: input.artwork,
      provenance: input.provenance,
      export: input.export,
      publish: input.publish,
      media: {
        accessionId: input.accessionId,
        revision: input.revision,
        objects: input.mediaObjects,
      },
    }),
  });
  const parsed = await readAdminJson<{
    commitSha?: string;
    paths?: string[];
    error?: string;
  }>(res);
  if (!parsed.ok || !parsed.data.commitSha) {
    throw new Error(parsed.data.error ?? "metadata-commit failed");
  }
  return {
    commitSha: parsed.data.commitSha,
    paths: parsed.data.paths ?? [],
  };
}
