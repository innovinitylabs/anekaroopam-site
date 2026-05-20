import type { ConversionOptions, ConversionResult } from "./types";
import { blobToDataUrl, compressionRatio } from "./bytes";
import { buildStatsFromBlob } from "./analyze";
import { detectFormatSupport, mimeForFormat } from "./format-support";
import type { WorkerRequest, WorkerResponse } from "./conversion.worker";

const WORKER_THRESHOLD_PIXELS = 1_500_000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
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

async function convertOnMainThread(
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
    options.lossless && (options.format === "png" || options.format === "webp")
      ? 1
      : options.quality;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Failed to encode ${mime}`))),
      mime,
      quality,
    );
  });

  return { blob, width, height, mimeType: mime };
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
      resolve({
        blob: new Blob([buffer], { type: mimeType }),
        width,
        height,
        mimeType,
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

export async function convertImage(
  source: string | File,
  options: ConversionOptions,
  originalByteSize?: number,
): Promise<ConversionResult> {
  const start = performance.now();
  const support = await detectFormatSupport();
  if (!support[options.format]) {
    const fallback = options.format === "avif" ? "webp" : "png";
    options = { ...options, format: support[fallback] ? fallback : "png" };
  }

  const dataUrl =
    typeof source === "string" ? source : await blobToDataUrlFromFile(source);
  const img = await loadImageElement(dataUrl);
  const pixels = img.naturalWidth * img.naturalHeight;

  const encoded =
    pixels > WORKER_THRESHOLD_PIXELS
      ? await convertInWorker(img, options)
      : await convertOnMainThread(img, options);

  const resultDataUrl = await blobToDataUrl(encoded.blob);
  const originalSize =
    originalByteSize ??
    (typeof source === "string"
      ? Math.round(((dataUrl.split(",")[1]?.length ?? 0) * 3) / 4)
      : source.size);

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
    format: options.format,
    compressionRatio: compressionRatio(originalSize, encoded.blob.size),
    processingMs: Math.round(performance.now() - start),
  };
}

function blobToDataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
