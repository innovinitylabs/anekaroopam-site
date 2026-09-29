"use client";

/**
 * Durable R2 commit: prepare derivatives locally, upload to R2 via
 * presigned URLs, verify, then commit metadata-only to GitHub.
 */

import {
  runBrowserArchiveImagePipeline,
  type BrowserDerivativeBlob,
} from "@/lib/archive/browser-image-pipeline";
import { buildBrowserMetadataPackage } from "@/lib/archive/browser-metadata-package";
import {
  prepareMasterLocally,
  type LocalPreparedMaster,
} from "@/lib/archive/browser-durable-commit";
import { buildR2MediaBlock } from "@/lib/archive/media-manifest";
import {
  sourceFilenameForUpload,
  type AccessionDraft,
  type ArchiveEntry,
  type DraftStatus,
} from "@/lib/archive/schema";
import {
  postMetadataCommit,
  putToPresignedUrl,
  requestUploadAuth,
  verifyUploads,
} from "@/lib/archive/upload-auth-client";
import type { ArchiveCommitPhase } from "@/lib/archive/commit-state";
import { ARCHIVE_IMAGE_OUTPUTS } from "@/lib/archive/image-specs";

export type { LocalPreparedMaster };
export { prepareMasterLocally, revokePreparedPreview } from "@/lib/archive/browser-durable-commit";

export interface BrowserR2CommitResult {
  slug: string;
  draft: AccessionDraft;
  commitSha: string;
  accessionId: string;
  artworkId: string | null;
  revision: number;
  files: { path: string; bytes: number }[];
  warnings: string[];
  archiveStatus: AccessionDraft["status"];
  binaryBytes: number;
  sourceBytes: number;
  uploadedKeys: string[];
  phase: ArchiveCommitPhase;
}

function roleForDerivativeFilename(filename: string): string {
  if (filename === ARCHIVE_IMAGE_OUTPUTS.artwork.filename) return "artwork";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.previewAvif.filename) return "preview";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.previewWebp.filename) return "previewWebp";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.socialJpg.filename) return "social";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.thumbJpg.filename) return "thumb";
  return "preview";
}

export async function commitBrowserR2Bundle(input: {
  draft: AccessionDraft;
  sourceFile: File;
  prepared?: LocalPreparedMaster | null;
  isExistingArchive: boolean;
  intendedStatus?: Extract<DraftStatus, "generated" | "published" | "hidden">;
  message?: string;
  onPhase?: (phase: ArchiveCommitPhase, detail?: string) => void;
}): Promise<BrowserR2CommitResult> {
  const report = (phase: ArchiveCommitPhase, detail?: string) => {
    input.onPhase?.(phase, detail);
  };

  report("preparing");
  const sourceBlob = input.sourceFile;
  const storedFilename = sourceFilenameForUpload(input.sourceFile.name);
  const prepared =
    input.prepared ?? (await prepareMasterLocally(sourceBlob));
  const images = await runBrowserArchiveImagePipeline(sourceBlob);

  const objectSpecs = [
    {
      role: "original",
      filename: storedFilename,
      contentType: input.sourceFile.type || "application/octet-stream",
      contentLength: sourceBlob.size,
    },
    {
      role: "prepared",
      filename: "master-prepared.avif",
      contentType: "image/avif",
      contentLength: prepared.blob.size,
    },
    ...images.derivatives.map((d: BrowserDerivativeBlob) => ({
      role: roleForDerivativeFilename(d.filename),
      filename: d.filename,
      contentType: d.mimeType || d.blob.type || "application/octet-stream",
      contentLength: d.blob.size,
    })),
  ];

  report("authorizing");
  const auth = await requestUploadAuth({
    slug: input.draft.slug,
    draftId: input.draft.draftId,
    isExistingArchive: input.isExistingArchive,
    storedFilename,
    objects: objectSpecs,
  });

  report("uploading");
  const uploadedKeys: string[] = [];
  const blobForKey = (key: string): Blob => {
    if (key.includes("/original/")) return sourceBlob;
    if (key.includes("/prepared/")) return prepared.blob;
    for (const d of images.derivatives) {
      if (key.endsWith(`/derivatives/${d.filename}`)) return d.blob;
    }
    throw new Error(`No blob matched upload key ${key}`);
  };
  try {
    for (const upload of auth.uploads) {
      await putToPresignedUrl(upload, blobForKey(upload.key));
      uploadedKeys.push(upload.key);
    }
  } catch (error) {
    report("failed_upload", error instanceof Error ? error.message : undefined);
    const err = new Error(
      error instanceof Error ? error.message : "R2 upload failed",
    );
    (err as Error & { phase?: ArchiveCommitPhase }).phase = "failed_upload";
    throw err;
  }

  report("verifying");
  try {
    await verifyUploads({
      accessionId: auth.accessionId,
      revision: auth.revision,
      artworkId: auth.artworkId,
      draftId: auth.draftId,
      objects: auth.uploads.map((u, i) => ({
        key: u.key,
        contentType: u.contentType,
        contentLength: u.contentLength,
        role: objectSpecs[i]?.role,
      })),
    });
  } catch (error) {
    report("failed_verify", error instanceof Error ? error.message : undefined);
    const err = new Error(
      error instanceof Error ? error.message : "upload-verify failed",
    );
    (err as Error & { phase?: ArchiveCommitPhase }).phase = "failed_verify";
    throw err;
  }

  report("uploaded_pending_metadata");

  const mediaBuilt = buildR2MediaBlock({
    accessionId: auth.accessionId,
    revision: auth.revision,
    storedFilename,
    publicBaseUrl: auth.publicBaseUrl,
    keyPrefix: auth.keyPrefix ?? "",
    original: {
      mimeType: input.sourceFile.type || "application/octet-stream",
      byteSize: sourceBlob.size,
    },
    prepared: {
      mimeType: "image/avif",
      byteSize: prepared.blob.size,
      width: prepared.width,
      height: prepared.height,
    },
    derivatives: images.derivatives.map((d) => ({
      filename: d.filename,
      mimeType: d.mimeType || "application/octet-stream",
      byteSize: d.blob.size,
      width: d.width,
      height: d.height,
    })),
  });

  const existingEntry = (auth.existingEntry as ArchiveEntry | null) ?? null;

  const draftWithIds: AccessionDraft = {
    ...input.draft,
    accessionId: auth.accessionId,
    draftId: auth.draftId,
    artwork: {
      ...input.draft.artwork,
      id: auth.draftId,
      metadata: {
        ...input.draft.artwork.metadata,
        accessionId: auth.accessionId,
      },
    },
    source: {
      kind: "original",
      originalFilename: input.sourceFile.name,
      storedFilename,
      mimeType: input.sourceFile.type || "application/octet-stream",
      byteSize: input.sourceFile.size,
      importedAt: new Date().toISOString(),
    },
    processing: {
      preparedSource: mediaBuilt.keys.prepared,
      preparedAt: prepared.preparedAt,
      prepareVersion: "browser-r2-v1",
    },
    status: input.intendedStatus ?? "generated",
    preparedAt: prepared.preparedAt,
  };

  const pack = buildBrowserMetadataPackage({
    draft: draftWithIds,
    existingEntry,
    status: input.intendedStatus ?? "generated",
    derivativeMetas: images.derivatives.map((d) => ({
      filename: d.filename,
      width: d.width,
      height: d.height,
      byteSize: d.blob.size,
      mimeType: d.mimeType,
    })),
    r2Media: mediaBuilt.media,
    r2Assets: mediaBuilt.assets,
    r2Derivatives: mediaBuilt.derivatives,
    omitDraftSidecars: false,
    includeManifest: true,
  });

  report("committing_metadata");
  let committed: { commitSha: string; paths: string[] };
  try {
    committed = await postMetadataCommit({
      slug: pack.slug,
      draftId: pack.draftId,
      artworkId: auth.artworkId,
      message:
        input.message ??
        (input.isExistingArchive
          ? `archive: revision ${pack.slug} r${auth.revision}`
          : `archive: accession ${pack.slug}`),
      textFiles: pack.files,
      accessionId: auth.accessionId,
      revision: auth.revision,
      mediaObjects: auth.uploads.map((u) => ({
        key: u.key,
        contentType: u.contentType,
        contentLength: u.contentLength,
      })),
      artwork: draftWithIds.artwork,
      provenance: draftWithIds.provenance,
      export: draftWithIds.export,
      publish: (input.intendedStatus ?? "generated") === "published",
    });
  } catch (error) {
    report(
      "failed_metadata",
      error instanceof Error ? error.message : undefined,
    );
    const err = new Error(
      error instanceof Error
        ? `Media uploaded to R2 but metadata commit failed: ${error.message}`
        : "Media uploaded to R2 but metadata commit failed",
    );
    (err as Error & { uploadedKeys?: string[]; phase?: ArchiveCommitPhase }).uploadedKeys =
      uploadedKeys;
    (err as Error & { phase?: ArchiveCommitPhase }).phase = "failed_metadata";
    throw err;
  }

  const binaryBytes =
    sourceBlob.size +
    prepared.blob.size +
    images.derivatives.reduce((n, d) => n + d.blob.size, 0);

  report("committed");

  return {
    slug: pack.slug,
    draft: pack.draft,
    commitSha: committed.commitSha,
    accessionId: auth.accessionId,
    revision: auth.revision,
    files: pack.files.map((f) => ({
      path: f.path,
      bytes: new TextEncoder().encode(f.content).byteLength,
    })),
    warnings: [
      ...pack.warnings,
      `Revision r${auth.revision} stored for ${auth.accessionId} (ref ${committed.commitSha.slice(0, 7)}).`,
    ],
    artworkId: auth.artworkId ?? null,
    archiveStatus: pack.draft.status,
    binaryBytes,
    sourceBytes: sourceBlob.size,
    uploadedKeys,
    phase: "committed",
  };
}
