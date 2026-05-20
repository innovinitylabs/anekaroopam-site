import type { EmbeddedImageAsset, HtmlExportEstimate } from "./types";
import { estimateHtmlSize } from "@/lib/image-processing/bytes";
import { compressionRatio, formatBytes } from "@/lib/image-processing/bytes";

export function estimateHtmlExport(
  embedded: EmbeddedImageAsset,
  originalByteSize: number,
  fallbacks: EmbeddedImageAsset[] = [],
): HtmlExportEstimate {
  const embeddedTotal =
    embedded.byteSize + fallbacks.reduce((sum, f) => sum + f.byteSize, 0);
  const base64Length = Math.ceil(embeddedTotal * 1.37);

  return {
    format: embedded.format,
    resolution: `${embedded.width} × ${embedded.height}`,
    embeddedSize: embeddedTotal,
    finalHtmlSize: estimateHtmlSize(base64Length),
    compressionRatio: compressionRatio(originalByteSize, embeddedTotal),
  };
}

export function formatExportSpecs(estimate: HtmlExportEstimate) {
  return [
    { label: "Format", value: estimate.format.toUpperCase() },
    { label: "Resolution", value: estimate.resolution },
    { label: "Embedded Size", value: formatBytes(estimate.embeddedSize) },
    { label: "Final HTML Size", value: formatBytes(estimate.finalHtmlSize) },
    {
      label: "Compression Ratio",
      value: `${estimate.compressionRatio}%`,
    },
  ];
}
