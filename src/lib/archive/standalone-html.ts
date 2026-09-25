import sharp from "sharp";
import { buildStandaloneHtml } from "@/lib/html-export/build-html";
import type { EmbeddedImageAsset } from "@/lib/html-export/types";
import type { StandaloneBuildResult } from "@/lib/html-export/standalone-profile";
import type { StandaloneExportProfile } from "@/lib/html-export/standalone-profile";
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

export type BuildStandaloneFromBuffersOptions = {
  profile?: StandaloneExportProfile;
  /** When false, never embed WebP even for compatible. Default true for compatible. */
  includeWebpFallback?: boolean;
  archiveMeta?: {
    manifest?: AccessionManifest;
    runtime?: AccessionRuntime;
    standaloneVersion?: string;
  };
};

/**
 * Build self-contained perception HTML from AVIF (+ optional WebP) buffers.
 * Returns size report for on-chain budgeting.
 */
export async function buildStandaloneHtmlFromBuffers(
  payload: ExportPayload,
  artworkBuffer: Buffer,
  previewWebpBuffer?: Buffer,
  archiveMetaOrOptions?:
    | BuildStandaloneFromBuffersOptions["archiveMeta"]
    | BuildStandaloneFromBuffersOptions,
): Promise<StandaloneBuildResult> {
  const options: BuildStandaloneFromBuffersOptions =
    archiveMetaOrOptions &&
    ("profile" in archiveMetaOrOptions ||
      "includeWebpFallback" in archiveMetaOrOptions ||
      "archiveMeta" in archiveMetaOrOptions)
      ? (archiveMetaOrOptions as BuildStandaloneFromBuffersOptions)
      : { archiveMeta: archiveMetaOrOptions as BuildStandaloneFromBuffersOptions["archiveMeta"] };

  const profile = options.profile ?? "compatible";
  const includeWebp =
    profile === "compatible" &&
    options.includeWebpFallback !== false &&
    Boolean(previewWebpBuffer);

  const embedded = await bufferToEmbedded(artworkBuffer, "avif");
  const fallbacks =
    includeWebp && previewWebpBuffer
      ? [await bufferToEmbedded(previewWebpBuffer, "webp")]
      : undefined;

  const artwork = {
    ...payload.artwork,
    // Markup carries the data URL; keep payload imageSrc empty to avoid callers
    // treating this as a remote URL.
    imageSrc: "",
  };

  const html = buildStandaloneHtml({
    payload: { ...payload, artwork },
    embedded,
    fallbacks,
    archiveMeta: options.archiveMeta,
    profile,
  });

  return {
    html,
    profile,
    htmlByteSize: Buffer.byteLength(html, "utf8"),
    embeddedAvifByteSize: artworkBuffer.length,
    embeddedWebpByteSize: includeWebp && previewWebpBuffer
      ? previewWebpBuffer.length
      : null,
  };
}
