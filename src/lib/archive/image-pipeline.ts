import sharp from "sharp";
import {
  ARCHIVE_IMAGE_OUTPUTS,
  type ArchiveImageVariant,
} from "./image-specs";
import type { DerivativeAsset } from "./schema";

export interface ArchiveImageBuffers {
  artwork: Buffer;
  previewAvif: Buffer;
  previewWebp: Buffer;
  socialJpg: Buffer;
  thumbJpg: Buffer;
}

async function encodeVariant(
  pipeline: sharp.Sharp,
  spec: (typeof ARCHIVE_IMAGE_OUTPUTS)[ArchiveImageVariant],
): Promise<Buffer> {
  if (spec.format === "webp") {
    return pipeline.webp({ quality: spec.quality }).toBuffer();
  }

  if (spec.format === "jpeg") {
    return pipeline.jpeg({ quality: spec.quality, mozjpeg: true }).toBuffer();
  }

  return pipeline
    .avif({
      quality: spec.quality,
      effort: "effort" in spec ? spec.effort : 5,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
}

async function variantPipeline(
  input: Buffer,
  variant: ArchiveImageVariant,
): Promise<Buffer> {
  const spec = ARCHIVE_IMAGE_OUTPUTS[variant];
  let pipeline = sharp(input, { failOn: "none" }).rotate();

  if ("maxEdge" in spec && spec.maxEdge) {
    pipeline = pipeline.resize(spec.maxEdge, spec.maxEdge, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if ("width" in spec && "height" in spec && spec.width && spec.height) {
    pipeline = pipeline.resize(spec.width, spec.height, {
      fit: spec.fit ?? "cover",
      position: "centre",
    });
  }

  return encodeVariant(pipeline, spec);
}

export async function runArchiveImagePipeline(
  sourceBuffer: Buffer,
): Promise<ArchiveImageBuffers> {
  const [artwork, previewAvif, previewWebp, socialJpg, thumbJpg] = await Promise.all([
    variantPipeline(sourceBuffer, "artwork"),
    variantPipeline(sourceBuffer, "previewAvif"),
    variantPipeline(sourceBuffer, "previewWebp"),
    variantPipeline(sourceBuffer, "socialJpg"),
    variantPipeline(sourceBuffer, "thumbJpg"),
  ]);

  return { artwork, previewAvif, previewWebp, socialJpg, thumbJpg };
}

export function bufferToDataUrl(buffer: Buffer, mime = "image/avif"): string {
  const base64 = buffer.toString("base64");
  return `data:${mime};base64,${base64}`;
}

export async function derivativeAssetFromBuffer(
  variant: ArchiveImageVariant,
  publicPath: string,
  buffer: Buffer,
  generatedAt: string,
): Promise<DerivativeAsset> {
  const spec = ARCHIVE_IMAGE_OUTPUTS[variant];
  const meta = await sharp(buffer).metadata();
  const role =
    variant === "thumbJpg"
      ? "thumb"
      : variant === "socialJpg"
        ? "social"
        : variant === "artwork"
          ? "artwork"
          : "preview";

  return {
    role,
    path: publicPath,
    format: spec.format,
    width: meta.width,
    height: meta.height,
    byteSize: buffer.length,
    generatedAt,
  };
}
