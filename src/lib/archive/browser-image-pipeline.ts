"use client";

/**
 * Browser-first five-derivative archive pipeline for Preview/durable mode.
 *
 * Server Sharp (`runArchiveImagePipeline`) remains local/dev and explicit
 * fallback only. On Vercel Preview the primary path is this module →
 * POST /api/admin/archive/commit-bundle.
 */

import { convertImage } from "@/lib/image-processing/convert";
import type { ConversionOptions } from "@/lib/image-processing/types";
import {
  ARCHIVE_IMAGE_OUTPUTS,
  archiveImageOutputFilenames,
} from "./image-specs";
import { coverCropRect, fitInsideMaxEdge } from "./browser-image-geometry";

export interface BrowserDerivativeBlob {
  filename: string;
  variant: keyof typeof ARCHIVE_IMAGE_OUTPUTS;
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

export interface BrowserArchiveImageResult {
  derivatives: BrowserDerivativeBlob[];
  byFilename: Record<string, Blob>;
}

function quality01(sharpQuality: number): number {
  return Math.min(1, Math.max(0.01, sharpQuality / 100));
}

async function loadImageFromBlob(source: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode source image"));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodeCoverJpeg(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const crop = coverCropRect(
    img.naturalWidth,
    img.naturalHeight,
    targetWidth,
    targetHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b || b.size === 0) {
          reject(new Error("Browser could not encode social JPEG"));
          return;
        }
        resolve(b);
      },
      "image/jpeg",
      quality01(quality),
    );
  });

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
    mimeType: blob.type || "image/jpeg",
  };
}

async function encodeViaConvert(
  source: File | Blob,
  options: ConversionOptions,
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const file =
    source instanceof File
      ? source
      : new File([source], options.filename, {
          type: source.type || "application/octet-stream",
        });
  const result = await convertImage(file, options);
  return {
    blob: result.blob,
    width: result.stats.width,
    height: result.stats.height,
    mimeType: result.stats.mimeType,
  };
}

/**
 * Produce the five canonical public derivatives from a browser File/Blob.
 * Filenames match `canonicalPublicDerivativeFilenames()` / ARCHIVE_IMAGE_OUTPUTS.
 */
export async function runBrowserArchiveImagePipeline(
  source: File | Blob,
): Promise<BrowserArchiveImageResult> {
  const expected = archiveImageOutputFilenames();
  const img = await loadImageFromBlob(source);
  const artworkSpec = ARCHIVE_IMAGE_OUTPUTS.artwork;
  const previewAvifSpec = ARCHIVE_IMAGE_OUTPUTS.previewAvif;
  const previewWebpSpec = ARCHIVE_IMAGE_OUTPUTS.previewWebp;
  const socialSpec = ARCHIVE_IMAGE_OUTPUTS.socialJpg;
  const thumbSpec = ARCHIVE_IMAGE_OUTPUTS.thumbJpg;

  const previewDims = fitInsideMaxEdge(
    img.naturalWidth,
    img.naturalHeight,
    previewAvifSpec.maxEdge!,
  );
  const thumbDims = fitInsideMaxEdge(
    img.naturalWidth,
    img.naturalHeight,
    thumbSpec.maxEdge!,
  );

  const [artwork, previewAvif, previewWebp, socialJpg, thumbJpg] =
    await Promise.all([
      encodeViaConvert(source, {
        format: "avif",
        quality: quality01(artworkSpec.quality),
        lossless: false,
        chromaSubsampling: "4:4:4",
        filename: artworkSpec.filename,
      }),
      encodeViaConvert(source, {
        format: "avif",
        quality: quality01(previewAvifSpec.quality),
        lossless: false,
        chromaSubsampling: "4:4:4",
        maxWidth: previewDims.width,
        maxHeight: previewDims.height,
        filename: previewAvifSpec.filename,
      }),
      encodeViaConvert(source, {
        format: "webp",
        quality: quality01(previewWebpSpec.quality),
        lossless: false,
        chromaSubsampling: "4:2:0",
        maxWidth: previewDims.width,
        maxHeight: previewDims.height,
        filename: previewWebpSpec.filename,
      }),
      encodeCoverJpeg(
        img,
        socialSpec.width,
        socialSpec.height,
        socialSpec.quality,
      ),
      encodeViaConvert(source, {
        format: "jpeg",
        quality: quality01(thumbSpec.quality),
        lossless: false,
        chromaSubsampling: "4:2:0",
        maxWidth: thumbDims.width,
        maxHeight: thumbDims.height,
        filename: thumbSpec.filename,
      }),
    ]);

  const derivatives: BrowserDerivativeBlob[] = [
    {
      filename: artworkSpec.filename,
      variant: "artwork",
      ...artwork,
    },
    {
      filename: previewAvifSpec.filename,
      variant: "previewAvif",
      ...previewAvif,
    },
    {
      filename: previewWebpSpec.filename,
      variant: "previewWebp",
      ...previewWebp,
    },
    {
      filename: socialSpec.filename,
      variant: "socialJpg",
      ...socialJpg,
    },
    {
      filename: thumbSpec.filename,
      variant: "thumbJpg",
      ...thumbJpg,
    },
  ];

  const byFilename: Record<string, Blob> = {};
  for (const item of derivatives) {
    byFilename[item.filename] = item.blob;
  }

  const got = Object.keys(byFilename).sort();
  const want = [...expected].sort();
  if (got.join("|") !== want.join("|")) {
    throw new Error(
      `Browser pipeline filenames mismatch: got ${got.join(", ")} want ${want.join(", ")}`,
    );
  }

  return { derivatives, byFilename };
}

/** Encode a prepared master AVIF for draft working/ (browser prepare path). */
export async function encodeBrowserPreparedMaster(
  source: File | Blob,
): Promise<{ blob: Blob; width: number; height: number }> {
  const encoded = await encodeViaConvert(source, {
    format: "avif",
    quality: quality01(ARCHIVE_IMAGE_OUTPUTS.artwork.quality),
    lossless: false,
    chromaSubsampling: "4:4:4",
    filename: "master-prepared.avif",
  });
  return {
    blob: encoded.blob,
    width: encoded.width,
    height: encoded.height,
  };
}
