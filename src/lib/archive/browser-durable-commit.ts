"use client";

/**
 * Durable browser-first commit: build derivatives + metadata locally, then
 * POST commit-bundle. Does not call server Sharp.
 */

import {
  encodeBrowserPreparedMaster,
  runBrowserArchiveImagePipeline,
  type BrowserDerivativeBlob,
} from "@/lib/archive/browser-image-pipeline";
import { buildBrowserMetadataPackage } from "@/lib/archive/browser-metadata-package";
import { postCommitBundle } from "@/lib/archive/commit-bundle-client";
import {
  sourceFilenameForUpload,
  type AccessionDraft,
  type ArchiveEntry,
} from "@/lib/archive/schema";
import { adminFetch } from "@/components/admin/admin-fetch";

export interface LocalPreparedMaster {
  blob: Blob;
  width: number;
  height: number;
  objectUrl: string;
  preparedAt: string;
}

export interface BrowserDurableCommitResult {
  slug: string;
  draft: AccessionDraft;
  commitSha: string;
  files: { path: string; bytes: number }[];
  warnings: string[];
  archiveStatus: AccessionDraft["status"];
}

export async function prepareMasterLocally(
  source: File | Blob,
): Promise<LocalPreparedMaster> {
  const encoded = await encodeBrowserPreparedMaster(source);
  return {
    blob: encoded.blob,
    width: encoded.width,
    height: encoded.height,
    objectUrl: URL.createObjectURL(encoded.blob),
    preparedAt: new Date().toISOString(),
  };
}

export function revokePreparedPreview(prepared: LocalPreparedMaster | null): void {
  if (prepared?.objectUrl) URL.revokeObjectURL(prepared.objectUrl);
}

async function loadExistingEntry(
  slug: string,
  isExisting: boolean,
): Promise<ArchiveEntry | null> {
  if (!isExisting) return null;
  const metaRes = await adminFetch(
    `/api/admin/archive/${encodeURIComponent(slug)}/metadata`,
  );
  if (!metaRes.ok) return null;
  const metaData = (await metaRes.json()) as { entry?: ArchiveEntry };
  return metaData.entry ?? null;
}

export async function commitBrowserDurableBundle(input: {
  draft: AccessionDraft;
  sourceFile: File;
  prepared?: LocalPreparedMaster | null;
  isExistingArchive: boolean;
  message?: string;
}): Promise<BrowserDurableCommitResult> {
  const sourceBlob = input.sourceFile;
  const storedFilename = sourceFilenameForUpload(input.sourceFile.name);
  const prepared =
    input.prepared ?? (await prepareMasterLocally(sourceBlob));

  const images = await runBrowserArchiveImagePipeline(sourceBlob);
  const existingEntry = await loadExistingEntry(
    input.draft.slug,
    input.isExistingArchive,
  );

  const draftWithSource: AccessionDraft = {
    ...input.draft,
    source: {
      kind: "original",
      originalFilename: input.sourceFile.name,
      storedFilename,
      mimeType: input.sourceFile.type || "application/octet-stream",
      byteSize: input.sourceFile.size,
      importedAt: new Date().toISOString(),
    },
    processing: {
      preparedSource: "working/master-prepared.avif",
      preparedAt: prepared.preparedAt,
      prepareVersion: "browser-avif-v1",
    },
    status: "generated",
    preparedAt: prepared.preparedAt,
  };

  const pack = buildBrowserMetadataPackage({
    draft: draftWithSource,
    existingEntry,
    derivativeMetas: images.derivatives.map((d: BrowserDerivativeBlob) => ({
      filename: d.filename,
      width: d.width,
      height: d.height,
      byteSize: d.blob.size,
      mimeType: d.mimeType,
    })),
  });

  const committed = await postCommitBundle({
    slug: pack.slug,
    draftId: pack.draftId,
    message: input.message ?? `archive: browser commit ${pack.slug}`,
    textFiles: pack.files,
    derivatives: images.derivatives,
    binaryFiles: [
      {
        path: `content/drafts/${pack.draftId}/source/${storedFilename}`,
        blob: sourceBlob,
        mimeType: input.sourceFile.type || "application/octet-stream",
      },
      {
        path: `content/drafts/${pack.draftId}/working/master-prepared.avif`,
        blob: prepared.blob,
        mimeType: "image/avif",
      },
      {
        path: `content/archive/${pack.slug}/source/${storedFilename}`,
        blob: sourceBlob,
        mimeType: input.sourceFile.type || "application/octet-stream",
      },
      {
        path: `content/archive/${pack.slug}/prepared/master-prepared.avif`,
        blob: prepared.blob,
        mimeType: "image/avif",
      },
    ],
  });

  const files = [
    ...pack.files.map((f) => ({
      path: f.path,
      bytes: new TextEncoder().encode(f.content).byteLength,
    })),
    ...images.derivatives.map((d) => ({
      path: `public/archive/${pack.slug}/${d.filename}`,
      bytes: d.blob.size,
    })),
    {
      path: `content/drafts/${pack.draftId}/source/${storedFilename}`,
      bytes: sourceBlob.size,
    },
    {
      path: `content/drafts/${pack.draftId}/working/master-prepared.avif`,
      bytes: prepared.blob.size,
    },
  ];

  return {
    slug: pack.slug,
    draft: pack.draft,
    commitSha: committed.commitSha,
    files,
    warnings: [
      ...pack.warnings,
      `Committed ${committed.commitSha.slice(0, 7)} to GitHub tip. Public View may 404 until redeploy.`,
    ],
    archiveStatus: existingEntry?.status ?? "generated",
  };
}
