import type { ImageAnalysis, ImageStats } from "./types";
import { formatBytes, compressionRatio } from "./bytes";
import { detectFormatSupport, loadingEstimate } from "./format-support";
import { decodeImageSource } from "./decode-source";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function sampleDominantColors(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): string[] {
  const sampleStep = Math.max(4, Math.floor(Math.min(w, h) / 64));
  const buckets = new Map<string, number>();

  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < w; x += sampleStep) {
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      if (a < 32) continue;
      const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rgb]) => {
      const [r, g, b] = rgb.split(",").map(Number);
      return `rgb(${r}, ${g}, ${b})`;
    });
}

function detectTransparency(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const step = Math.max(4, Math.floor(Math.min(w, h) / 48));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (ctx.getImageData(x, y, 1, 1).data[3] < 250) return true;
    }
  }
  return false;
}

export async function analyzeImage(
  source: string | File,
  originalByteSize?: number,
): Promise<ImageAnalysis> {
  const decoded = await decodeImageSource(source);
  const img = await loadImage(decoded.dataUrl);

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.drawImage(img, 0, 0);
  const byteSize = originalByteSize ?? decoded.originalByteSize;

  const stats: ImageStats = {
    width,
    height,
    byteSize,
    mimeType: decoded.sourceMime,
    aspectRatio: width / height,
  };

  const formatSupport = await detectFormatSupport();

  return {
    stats,
    hasTransparency: detectTransparency(ctx, width, height),
    estimatedMemoryMb: (width * height * 4) / (1024 * 1024),
    dominantColors: sampleDominantColors(ctx, width, height),
    formatSupport,
    loadingEstimate: loadingEstimate(byteSize),
  };
}

export function buildStatsFromBlob(
  blob: Blob,
  width: number,
  height: number,
  mimeType: string,
): ImageStats {
  return {
    width,
    height,
    byteSize: blob.size,
    mimeType,
    aspectRatio: width / height,
  };
}

export { formatBytes, compressionRatio };
