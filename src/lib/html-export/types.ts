import type { ImageFormat } from "@/lib/image-processing/types";
import type { ExportPayload } from "@/lib/perception/types";
import type { AccessionManifest } from "@/lib/archive/schema";
import type { AccessionRuntime } from "@/lib/archive/runtime";

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

export interface StandaloneArchiveMeta {
  manifest?: AccessionManifest;
  runtime?: AccessionRuntime;
  standaloneVersion?: string;
}
