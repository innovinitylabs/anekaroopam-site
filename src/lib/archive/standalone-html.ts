import sharp from "sharp";
import { buildStandaloneHtml } from "@/lib/html-export/build-html";
import type { EmbeddedImageAsset } from "@/lib/html-export/types";
import type { ExportPayload } from "@/lib/perception/types";
import { bufferToDataUrl } from "./image-pipeline";

async function bufferToEmbedded(buffer: Buffer): Promise<EmbeddedImageAsset> {
  const meta = await sharp(buffer).metadata();
  return {
    format: "avif",
    dataUrl: bufferToDataUrl(buffer),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    byteSize: buffer.length,
  };
}

export async function buildStandaloneHtmlFromBuffers(
  payload: ExportPayload,
  artworkBuffer: Buffer,
  previewBuffer?: Buffer,
): Promise<string> {
  const embedded = await bufferToEmbedded(artworkBuffer);
  const fallbacks = previewBuffer
    ? [await bufferToEmbedded(previewBuffer)]
    : undefined;

  const artwork = {
    ...payload.artwork,
    imageSrc: embedded.dataUrl,
  };

  return buildStandaloneHtml({
    payload: { ...payload, artwork },
    embedded,
    fallbacks,
  });
}
