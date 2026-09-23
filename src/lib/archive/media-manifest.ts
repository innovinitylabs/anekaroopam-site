/**
 * Build ArchiveMedia + absolute derivative paths for R2 commits.
 */

import {
  ARCHIVE_IMAGE_OUTPUTS,
  archiveImageOutputFilenames,
} from "./image-specs";
import {
  r2ArchiveAssets,
  type ArchiveMedia,
  type ArchiveMediaObject,
  type DerivativeAsset,
} from "./schema";
import { buildAllRevisionKeys } from "@/lib/r2/object-keys";
import { publicUrlForR2Key } from "@/lib/r2/public-url";

export interface R2MediaBuildInput {
  accessionId: string;
  revision: number;
  storedFilename: string;
  publicBaseUrl: string;
  original: {
    mimeType: string;
    byteSize: number;
    width?: number;
    height?: number;
    sha256?: string;
  };
  prepared?: {
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    sha256?: string;
  };
  derivatives: Array<{
    filename: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    sha256?: string;
  }>;
}

function roleForFilename(filename: string): DerivativeAsset["role"] {
  if (filename === ARCHIVE_IMAGE_OUTPUTS.thumbJpg.filename) return "thumb";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.socialJpg.filename) return "social";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.artwork.filename) return "artwork";
  return "preview";
}

function formatForFilename(filename: string): string {
  if (filename.endsWith(".avif")) return "avif";
  if (filename.endsWith(".webp")) return "webp";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "jpeg";
  if (filename.endsWith(".png")) return "png";
  return "bin";
}

export function buildR2MediaBlock(input: R2MediaBuildInput): {
  media: ArchiveMedia;
  assets: ReturnType<typeof r2ArchiveAssets>;
  derivatives: DerivativeAsset[];
  keys: ReturnType<typeof buildAllRevisionKeys>;
} {
  const keys = buildAllRevisionKeys({
    accessionId: input.accessionId,
    revision: input.revision,
    storedFilename: input.storedFilename,
  });

  const byFilename = new Map(
    input.derivatives.map((d) => [d.filename, d]),
  );

  const mediaDerivatives: ArchiveMediaObject[] = archiveImageOutputFilenames().map(
    (filename) => {
      const meta = byFilename.get(filename);
      const key = `archive/${input.accessionId}/r${input.revision}/derivatives/${filename}`;
      return {
        key,
        role: roleForFilename(filename),
        mimeType: meta?.mimeType ?? "application/octet-stream",
        byteSize: meta?.byteSize ?? 0,
        width: meta?.width,
        height: meta?.height,
        sha256: meta?.sha256,
      };
    },
  );

  const media: ArchiveMedia = {
    schemaVersion: 1,
    storage: "r2",
    accessionId: input.accessionId,
    revision: input.revision,
    original: {
      key: keys.original,
      mimeType: input.original.mimeType,
      byteSize: input.original.byteSize,
      width: input.original.width,
      height: input.original.height,
      sha256: input.original.sha256,
    },
    prepared: input.prepared
      ? {
          key: keys.prepared,
          mimeType: input.prepared.mimeType,
          byteSize: input.prepared.byteSize,
          width: input.prepared.width,
          height: input.prepared.height,
          sha256: input.prepared.sha256,
        }
      : undefined,
    derivatives: mediaDerivatives,
  };

  const assets = r2ArchiveAssets(input.publicBaseUrl, keys.derivatives);
  const generatedAt = new Date().toISOString();
  const derivatives: DerivativeAsset[] = archiveImageOutputFilenames().map(
    (filename) => {
      const meta = byFilename.get(filename);
      const key = `archive/${input.accessionId}/r${input.revision}/derivatives/${filename}`;
      return {
        role: roleForFilename(filename),
        path: publicUrlForR2Key(key, input.publicBaseUrl),
        format: formatForFilename(filename),
        width: meta?.width ?? 1,
        height: meta?.height ?? 1,
        byteSize: meta?.byteSize ?? 0,
        generatedAt,
      };
    },
  );

  return { media, assets, derivatives, keys };
}

export function nextMediaRevision(existing?: ArchiveMedia | null): number {
  if (!existing || existing.storage !== "r2") return 1;
  return existing.revision + 1;
}
