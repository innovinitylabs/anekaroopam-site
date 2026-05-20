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

export function extensionForFormat(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export async function detectFormatSupport(): Promise<Record<ImageFormat, boolean>> {
  if (typeof document === "undefined") {
    return { avif: false, webp: true, png: true, jpeg: true };
  }

  const avif = await canEncode("image/avif");
  const webp = await canEncode("image/webp");

  return {
    avif,
    webp,
    png: true,
    jpeg: true,
  };
}

async function canEncode(mime: string): Promise<boolean> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, 0.5),
    );
    return blob !== null && blob.size > 0;
  } catch {
    return false;
  }
}

export function loadingEstimate(byteSize: number): "fast" | "moderate" | "slow" {
  if (byteSize < 400_000) return "fast";
  if (byteSize < 2_500_000) return "moderate";
  return "slow";
}
