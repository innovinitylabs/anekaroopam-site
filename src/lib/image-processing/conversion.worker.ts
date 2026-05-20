import type { ConversionOptions } from "./types";
import { mimeForFormat } from "./format-support";

export type WorkerRequest = {
  imageBitmap: ImageBitmap;
  options: ConversionOptions;
};

export type WorkerResponse = {
  buffer: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
};

function computeDimensions(
  sw: number,
  sh: number,
  maxWidth?: number,
  maxHeight?: number,
): { width: number; height: number } {
  let width = sw;
  let height = sh;
  if (!maxWidth && !maxHeight) return { width, height };

  const limitW = maxWidth ?? width;
  const limitH = maxHeight ?? height;
  const scale = Math.min(1, limitW / width, limitH / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { imageBitmap, options } = event.data;
  const { width, height } = computeDimensions(
    imageBitmap.width,
    imageBitmap.height,
    options.maxWidth,
    options.maxHeight,
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    self.postMessage({ error: "Canvas unavailable" });
    return;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close();

  const mime = mimeForFormat(
    options.format,
    options.lossless || options.format === "png",
  );
  const quality =
    options.format === "png"
      ? undefined
      : options.lossless && options.format === "webp"
        ? 1
        : options.quality;

  const blob = await canvas.convertToBlob({ type: mime, quality });
  if (!blob || blob.size === 0) {
    self.postMessage({ error: `Failed to encode ${options.format}` });
    return;
  }
  const buffer = await blob.arrayBuffer();

  const response: WorkerResponse = {
    buffer,
    mimeType: mime,
    width,
    height,
  };

  self.postMessage(response, { transfer: [buffer] });
};
