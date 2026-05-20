import type { ImageFormat } from "@/lib/image-processing/types";
import type { ExportPayload } from "@/lib/perception/types";

export interface EmbeddedImageAsset {
  format: ImageFormat;
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
}

export interface HtmlExportOptions {
  primaryFormat: ImageFormat;
  fallbacks?: EmbeddedImageAsset[];
  includePictureElement?: boolean;
}

export interface HtmlExportEstimate {
  format: ImageFormat;
  resolution: string;
  embeddedSize: number;
  finalHtmlSize: number;
  compressionRatio: number;
}

export type HtmlExportInput = ExportPayload & {
  embedded: EmbeddedImageAsset;
  fallbacks?: EmbeddedImageAsset[];
  options?: HtmlExportOptions;
};
