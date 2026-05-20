"use client";

import type { ConversionOptions, ConversionResult, ImageFormat } from "./types";
import { blobToDataUrl, compressionRatio } from "./bytes";
import { buildStatsFromBlob } from "./analyze";
import {
  detectFormatSupport,
  formatFromMime,
  mimeForFormat,
} from "./format-support";
import { decodeImageSource } from "./decode-source";
import { encodeAvifWasm } from "./encode-avif";
import type { WorkerRequest, WorkerResponse } from "./conversion.worker";

const WORKER_THRESHOLD_PIXELS = 1_500_000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for encoding"));
    img.src = src;
  });
}

function computeDimensions(
  sw: number,
  sh: number,
  maxWidth?: number,
  maxHeight?: number,
) {
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

async function encodeOnCanvas(
  img: HTMLImageElement,
  options: ConversionOptions,
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const { width, height } = computeDimensions(
    img.naturalWidth,
    img.naturalHeight,
    options.maxWidth,
    options.maxHeight,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b || b.size === 0) {
          reject(new Error(`Browser could not encode ${options.format.toUpperCase()}`));
          return;
        }
        resolve(b);
      },
      mime,
      quality,
    );
  });

  const actualMime = blob.type || mime;
  return { blob, width, height, mimeType: actualMime };
}

async function convertInWorker(
  img: HTMLImageElement,
  options: ConversionOptions,
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const bitmap = await createImageBitmap(img);
  const worker = new Worker(
    new URL("./conversion.worker.ts", import.meta.url),
    { type: "module" },
  );

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse & { error?: string }>) => {
      worker.terminate();
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      const { buffer, mimeType, width, height } = event.data;
      const blob = new Blob([buffer], { type: mimeType });
      if (blob.size === 0) {
        reject(new Error("Worker produced empty image"));
        return;
      }
      resolve({
        blob,
        width,
        height,
        mimeType: blob.type || mimeType,
      });
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage(
      { imageBitmap: bitmap, options } satisfies WorkerRequest,
      { transfer: [bitmap] },
    );
  });
}

async function encodeRaster(
  img: HTMLImageElement,
  options: ConversionOptions,
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  if (options.format === "avif") {
    return encodeAvifWasm(img, options);
  }

  const pixels = img.naturalWidth * img.naturalHeight;
  if (pixels > WORKER_THRESHOLD_PIXELS) {
    try {
      return await convertInWorker(img, options);
    } catch {
      return encodeOnCanvas(img, options);
    }
  }
  return encodeOnCanvas(img, options);
}

async function resolveOutputFormat(
  requested: ImageFormat,
  support: Record<ImageFormat, boolean>,
): Promise<ImageFormat> {
  if (requested === "avif") return "avif";
  if (support[requested]) return requested;
  return "png";
}

export async function convertImage(
  source: string | File,
  options: ConversionOptions,
  originalByteSize?: number,
): Promise<ConversionResult> {
  const start = performance.now();
  const support = await detectFormatSupport();
  const outputFormat = await resolveOutputFormat(options.format, support);
  const encodeOptions: ConversionOptions = {
    ...options,
    format: outputFormat,
  };

  const decoded = await decodeImageSource(source);
  const img = await loadImageElement(decoded.dataUrl);

  const encoded = await encodeRaster(img, encodeOptions);

  const actualFormat =
    formatFromMime(encoded.mimeType) ?? encodeOptions.format;
  const resultDataUrl = await blobToDataUrl(encoded.blob);
  const originalSize = originalByteSize ?? decoded.originalByteSize;

  const stats = buildStatsFromBlob(
    encoded.blob,
    encoded.width,
    encoded.height,
    encoded.mimeType,
  );

  return {
    blob: encoded.blob,
    dataUrl: resultDataUrl,
    stats,
    format: actualFormat,
    requestedFormat: options.format,
    compressionRatio: compressionRatio(originalSize, encoded.blob.size),
    processingMs: Math.round(performance.now() - start),
    transcodedFromHeic: decoded.decodedViaTranscode,
    encodedWithWasm: outputFormat === "avif",
  };
}

export function defaultConversionOptions(filename = "artwork"): ConversionOptions {
  return {
    format: "avif",
    quality: 0.82,
    lossless: false,
    chromaSubsampling: "4:4:4",
    filename,
  };
}
