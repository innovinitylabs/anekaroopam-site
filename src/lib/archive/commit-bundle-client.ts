"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import type { BrowserDerivativeBlob } from "@/lib/archive/browser-image-pipeline";
import type { MetadataPackageFile } from "@/lib/archive/browser-metadata-package";

export async function postCommitBundle(input: {
  slug: string;
  draftId?: string;
  message?: string;
  textFiles: MetadataPackageFile[];
  derivatives: BrowserDerivativeBlob[];
}): Promise<{ commitSha: string; paths: string[] }> {
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

  const res = await adminFetch("/api/admin/archive/commit-bundle", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as {
    commitSha?: string;
    paths?: string[];
    error?: string;
  };
  if (!res.ok || !data.commitSha) {
    throw new Error(data.error ?? "commit-bundle failed");
  }
  return { commitSha: data.commitSha, paths: data.paths ?? [] };
}
