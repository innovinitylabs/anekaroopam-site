import type { ConversionResult } from "@/lib/image-processing/types";
import { extensionForFormat } from "@/lib/image-processing/format-support";
import type { EmbeddedImageAsset } from "@/lib/html-export/types";
import { buildStandaloneHtml } from "@/lib/html-export/build-html";
import { downloadHtml, downloadBlob } from "@/lib/html-export/download";
import type { ExportPayload } from "@/lib/perception/types";

export function conversionToEmbedded(result: ConversionResult): EmbeddedImageAsset {
  return {
    format: result.format,
    dataUrl: result.dataUrl,
    width: result.stats.width,
    height: result.stats.height,
    byteSize: result.stats.byteSize,
  };
}

export interface StandaloneExportInput {
  payload: ExportPayload;
  conversion: ConversionResult;
  fallbacks?: ConversionResult[];
  filename?: string;
}

export function runStandaloneHtmlExport(input: StandaloneExportInput): string {
  const embedded = conversionToEmbedded(input.conversion);
  const fallbacks = input.fallbacks?.map(conversionToEmbedded);

  const artwork = {
    ...input.payload.artwork,
    imageSrc: embedded.dataUrl,
  };

  return buildStandaloneHtml({
    payload: { ...input.payload, artwork },
    embedded,
    fallbacks,
  });
}

export function downloadStandaloneArtifact(input: StandaloneExportInput): void {
  const html = runStandaloneHtmlExport(input);
  const base =
    input.filename ??
    (input.payload.artwork.metadata.title.toLowerCase().replace(/\s+/g, "-") ||
      "orientation");
  downloadHtml(`${base}.html`, html);
}

export function downloadConvertedImage(
  result: ConversionResult,
  filename: string,
): void {
  const ext = extensionForFormat(result.format);
  const safeName = filename.replace(/\.[^.]+$/, "");
  downloadBlob(`${safeName}.${ext}`, result.blob);
}
