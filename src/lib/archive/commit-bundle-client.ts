"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import { readAdminJson } from "@/lib/archive/admin-response";
import type { BrowserDerivativeBlob } from "@/lib/archive/browser-image-pipeline";
import type { MetadataPackageFile } from "@/lib/archive/browser-metadata-package";
import {
  assertCommitBundleClientLimits,
  MAX_BUNDLE_BINARY_BYTES,
  MAX_SOURCE_BYTES,
} from "@/lib/archive/commit-bundle-limits";

export interface CommitBundleBinaryFile {
  path: string;
  blob: Blob;
  mimeType?: string;
}

export function estimateCommitBinaryBytes(input: {
  derivatives: { blob: { size: number } }[];
  binaryFiles?: { blob: { size: number } }[];
}): number {
  let total = 0;
  for (const d of input.derivatives) total += d.blob.size;
  for (const b of input.binaryFiles ?? []) total += b.blob.size;
  return total;
}

export { assertCommitBundleClientLimits, MAX_BUNDLE_BINARY_BYTES, MAX_SOURCE_BYTES };

export async function postCommitBundle(input: {
  slug: string;
  draftId?: string;
  message?: string;
  textFiles: MetadataPackageFile[];
  derivatives: BrowserDerivativeBlob[];
  binaryFiles?: CommitBundleBinaryFile[];
  sourceBytes?: number;
}): Promise<{ commitSha: string; paths: string[] }> {
  const binaryBytes = estimateCommitBinaryBytes(input);
  assertCommitBundleClientLimits({
    sourceBytes: input.sourceBytes ?? 0,
    binaryBytes,
  });

  const form = new FormData();
  form.set("slug", input.slug);
  if (input.draftId) form.set("draftId", input.draftId);
  if (input.message) form.set("message", input.message);

  for (const file of input.textFiles) {
    form.set(`path:${file.path}`, file.content);
  }

  for (const derivative of input.derivatives) {
    const repoPath = `public/archive/${input.slug}/${derivative.filename}`;
    form.append(
      "file",
      new File([derivative.blob], repoPath, {
        type: derivative.mimeType || derivative.blob.type || "application/octet-stream",
      }),
    );
  }

  for (const binary of input.binaryFiles ?? []) {
    form.append(
      "file",
      new File([binary.blob], binary.path, {
        type: binary.mimeType || binary.blob.type || "application/octet-stream",
      }),
    );
  }

  const res = await adminFetch("/api/admin/archive/commit-bundle", {
    method: "POST",
    body: form,
  });
  const parsed = await readAdminJson<{
    commitSha?: string;
    paths?: string[];
    error?: string;
  }>(res);
  if (!parsed.ok || !parsed.data.commitSha) {
    throw new Error(parsed.data.error ?? "commit-bundle failed");
  }
  return {
    commitSha: parsed.data.commitSha,
    paths: parsed.data.paths ?? [],
  };
}
