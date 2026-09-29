"use client";

import type { ConversionOptions } from "./types";

function computeDimensions(
  sw: number,
  sh: number,
  maxWidth?: number,
  maxHeight?: number,
) {
  const width = sw;
  const height = sh;
  if (!maxWidth && !maxHeight) return { width, height };
  const limitW = maxWidth ?? width;
  const limitH = maxHeight ?? height;
  const scale = Math.min(1, limitW / width, limitH / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function chromaToSubsample(
  chroma: ConversionOptions["chromaSubsampling"],
): number {
  switch (chroma) {
    case "4:4:4":
      return 3;
    case "4:2:2":
      return 2;
    case "4:2:0":
    default:
      return 1;
  }
}

function imageDataFromCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * AVIF encode via libavif WebAssembly (@jsquash/avif).
 * Works in Safari, Firefox, and Chromium (unlike canvas.toBlob AVIF).
 */
export async function encodeAvifWasm(
  img: HTMLImageElement,
  options: ConversionOptions,
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const { width, height } = computeDimensions(
    img.naturalWidth,
    img.naturalHeight,
    options.maxWidth,
    options.maxHeight,
  );

  const imageData = imageDataFromCanvas(img, width, height);
  const { encode } = await import("@jsquash/avif");

  const quality = options.lossless
    ? 100
    : Math.min(100, Math.max(1, Math.round(options.quality * 100)));

  const buffer = await encode(imageData, {
    quality,
    lossless: options.lossless,
    subsample: options.lossless ? 3 : chromaToSubsample(options.chromaSubsampling),
    speed: 6,
  });

  if (!buffer || buffer.byteLength === 0) {
    throw new Error("AVIF encoder produced empty output");
  }

  return {
    blob: new Blob([buffer], { type: "image/avif" }),
    width,
    height,
    mimeType: "image/avif",
  };
}
