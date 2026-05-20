import type { ImageFormat } from "./types";

export function mimeForFormat(format: ImageFormat, lossless: boolean): string {
  switch (format) {
    case "avif":
      return "image/avif";
    case "webp":
      return lossless ? "image/webp" : "image/webp";
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
  }
}

export function formatFromMime(mime: string): ImageFormat | null {
  const m = mime.toLowerCase();
  if (m.includes("avif")) return "avif";
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpeg";
  return null;
}

export function extensionForFormat(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

/** AVIF export uses WASM (libavif), not canvas.toBlob. */
export const AVIF_VIA_WASM = true;

export async function detectFormatSupport(): Promise<Record<ImageFormat, boolean>> {
  if (typeof document === "undefined") {
    return { avif: false, webp: true, png: true, jpeg: true };
  }

  const webp = await canEncodeCanvas("image/webp");

  return {
    avif: true,
    webp,
    png: true,
    jpeg: true,
  };
}

function mimeBase(m: string): string {
  return m.split(";")[0].trim().toLowerCase();
}

async function canEncodeCanvas(mime: string): Promise<boolean> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 2, 2);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, 0.5),
    );
    if (!blob || blob.size === 0) return false;
    if (blob.type && mimeBase(blob.type) !== mimeBase(mime)) return false;
    return true;
  } catch {
    return false;
  }
}

export function loadingEstimate(byteSize: number): "fast" | "moderate" | "slow" {
  if (byteSize < 400_000) return "fast";
  if (byteSize < 2_500_000) return "moderate";
  return "slow";
}
