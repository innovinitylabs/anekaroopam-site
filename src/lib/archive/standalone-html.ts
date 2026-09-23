import sharp from "sharp";
import { buildStandaloneHtml } from "@/lib/html-export/build-html";
import type { EmbeddedImageAsset } from "@/lib/html-export/types";
import type { ExportPayload } from "@/lib/perception/types";
import { bufferToDataUrl, isArchiveImagePipelineTestMode } from "./image-pipeline";
import type { AccessionManifest } from "./schema";
import type { AccessionRuntime } from "./runtime";

type EmbeddedFormat = EmbeddedImageAsset["format"];

function mimeForEmbeddedFormat(format: EmbeddedFormat): string {
  switch (format) {
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "avif":
    default:
      return "image/avif";
  }
}

async function bufferToEmbedded(
  buffer: Buffer,
  format: EmbeddedFormat = "avif",
): Promise<EmbeddedImageAsset> {
  if (isArchiveImagePipelineTestMode()) {
    return {
      format,
      dataUrl: bufferToDataUrl(buffer, mimeForEmbeddedFormat(format)),
      width: 1,
      height: 1,
      byteSize: buffer.length,
    };
  }

  const meta = await sharp(buffer).metadata();
  return {
    format,
    dataUrl: bufferToDataUrl(buffer, mimeForEmbeddedFormat(format)),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    byteSize: buffer.length,
  };
}

export async function buildStandaloneHtmlFromBuffers(
  payload: ExportPayload,
  artworkBuffer: Buffer,
  previewWebpBuffer?: Buffer,
  archiveMeta?: {
    manifest?: AccessionManifest;
    runtime?: AccessionRuntime;
    standaloneVersion?: string;
  },
): Promise<string> {
  const embedded = await bufferToEmbedded(artworkBuffer, "avif");
  const fallbacks = previewWebpBuffer
    ? [await bufferToEmbedded(previewWebpBuffer, "webp")]
    : undefined;

  const artwork = {
    ...payload.artwork,
    imageSrc: embedded.dataUrl,
  };

  return buildStandaloneHtml({
    payload: { ...payload, artwork },
    embedded,
    fallbacks,
    archiveMeta,
  });
}
