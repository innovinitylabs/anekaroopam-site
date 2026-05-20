import { blobToDataUrl } from "./bytes";
import { estimateDataUrlBytes } from "./analyze-utils";

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_EXT = /\.(heic|heif|hif)$/i;

export type DecodedImageSource = {
  dataUrl: string;
  /** Original file byte size when known (for compression stats). */
  originalByteSize: number;
  sourceMime: string;
  sourceName: string;
  /** True when an intermediate decode step ran (e.g. HEIC to JPEG). */
  decodedViaTranscode: boolean;
};

export function isHeicLike(file: File): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  return HEIC_EXT.test(file.name);
}

export function isLikelyBrowserDecodable(file: File): boolean {
  if (isHeicLike(file)) return false;
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|avif|bmp|ico|svg)$/i.test(file.name);
}

async function decodeHeicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("HEIC decode produced no output");
  return blob;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

async function verifyImageLoads(dataUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () =>
      reject(
        new Error(
          "This image format is not supported in your browser. Try HEIC/HEIF (we transcode those) or export as JPEG/PNG first.",
        ),
      );
    img.src = dataUrl;
  });
}

/**
 * Normalizes any upload or data URL into a canvas-decodable raster for encoding.
 */
export async function decodeImageSource(
  source: string | File,
): Promise<DecodedImageSource> {
  if (typeof source === "string") {
    await verifyImageLoads(source);
    return {
      dataUrl: source,
      originalByteSize: estimateDataUrlBytes(source),
      sourceMime: parseDataUrlMime(source),
      sourceName: "embedded",
      decodedViaTranscode: false,
    };
  }

  const file = source;

  if (isHeicLike(file)) {
    const jpegBlob = await decodeHeicToJpeg(file);
    const dataUrl = await blobToDataUrl(jpegBlob);
    await verifyImageLoads(dataUrl);
    return {
      dataUrl,
      originalByteSize: file.size,
      sourceMime: file.type || "image/heic",
      sourceName: file.name,
      decodedViaTranscode: true,
    };
  }

  if (!isLikelyBrowserDecodable(file)) {
    throw new Error(
      `Unsupported input format (${file.type || "unknown"}). Supported uploads include JPEG, PNG, WebP, AVIF, GIF, BMP, SVG, and HEIC/HEIF.`,
    );
  }

  const dataUrl = await readFileAsDataUrl(file);
  await verifyImageLoads(dataUrl);

  return {
    dataUrl,
    originalByteSize: file.size,
    sourceMime: file.type || "image/unknown",
    sourceName: file.name,
    decodedViaTranscode: false,
  };
}

function parseDataUrlMime(dataUrl: string): string {
  const m = /^data:([^;,]+)/.exec(dataUrl);
  return m?.[1] ?? "image/unknown";
}
