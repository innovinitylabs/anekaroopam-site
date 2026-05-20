import type { ImageAnalysis, ImageStats } from "./types";
import { formatBytes, compressionRatio } from "./bytes";
import { detectFormatSupport, loadingEstimate } from "./format-support";

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
  const dataUrl =
    typeof source === "string" ? source : await readFileAsDataUrl(source);
  const img = await loadImage(dataUrl);

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.drawImage(img, 0, 0);
  const byteSize =
    originalByteSize ??
    (typeof source === "string"
      ? estimateDataUrlBytes(dataUrl)
      : source.size);

  const stats: ImageStats = {
    width,
    height,
    byteSize,
    mimeType: typeof source === "string" ? "image/unknown" : source.type,
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 3) / 4);
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
