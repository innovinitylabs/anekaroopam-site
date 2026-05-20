"use client";

import { useMemo, useState } from "react";
import type { PerceptionArtwork } from "@/lib/perception/types";
import type { ImageFormat } from "@/lib/image-processing/types";
import {
  convertImage,
  defaultConversionOptions,
  formatBytes,
} from "@/lib/image-processing";
import { getPreset } from "@/lib/image-processing/presets";
import {
  conversionToEmbedded,
  downloadStandaloneArtifact,
} from "@/lib/export-engine/pipeline";
import {
  estimateHtmlExport,
  formatExportSpecs,
} from "@/lib/html-export/estimate";
import { SpecTable } from "@/components/perception-tools/SpecTable";

const FORMATS: ImageFormat[] = ["avif", "webp", "png", "jpeg"];

interface ExportHtmlSectionProps {
  artwork: PerceptionArtwork;
  imageSrc: string;
  originalByteSize?: number;
  filename?: string;
  compact?: boolean;
}

export function ExportHtmlSection({
  artwork,
  imageSrc,
  originalByteSize,
  filename,
  compact,
}: ExportHtmlSectionProps) {
  const [format, setFormat] = useState<ImageFormat>("avif");
  const [enableFallback, setEnableFallback] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastEstimate, setLastEstimate] = useState<ReturnType<
    typeof estimateHtmlExport
  > | null>(null);

  const estimatePreview = useMemo(() => {
    if (!originalByteSize) return null;
    const preset = getPreset("perceptual");
    const ratio =
      format === "avif" ? 0.22 : format === "webp" ? 0.35 : format === "png" ? 0.85 : 0.5;
    const embedded = Math.round(originalByteSize * ratio);
    const embeddedAsset = {
      format,
      dataUrl: "",
      width: 0,
      height: 0,
      byteSize: embedded,
    };
    return estimateHtmlExport(embeddedAsset, originalByteSize);
  }, [format, originalByteSize]);

  const handleExport = async () => {
    if (!imageSrc) return;
    setExporting(true);
    try {
      const preset = getPreset("perceptual");
      const options = {
        ...defaultConversionOptions(filename),
        ...preset.options,
        format,
        quality: preset.options.quality ?? 0.82,
        lossless: format === "png" && Boolean(preset.options.lossless),
        filename: filename ?? "orientation",
      };

      const converted = await convertImage(imageSrc, options, originalByteSize);
      let fallbacks;
      if (enableFallback && format === "avif") {
        const webp = await convertImage(
          imageSrc,
          { ...options, format: "webp" },
          originalByteSize,
        );
        fallbacks = [webp];
      }

      const embedded = conversionToEmbedded(converted);
      const fallbackEmbedded = fallbacks?.map(conversionToEmbedded);
      setLastEstimate(
        estimateHtmlExport(
          embedded,
          originalByteSize ?? converted.stats.byteSize * 4,
          fallbackEmbedded,
        ),
      );

      downloadStandaloneArtifact({
        payload: {
          version: 1,
          artwork: { ...artwork, imageSrc: converted.dataUrl },
          exportedAt: new Date().toISOString(),
        },
        conversion: converted,
        fallbacks,
        filename,
      });
    } finally {
      setExporting(false);
    }
  };

  const specs = lastEstimate
    ? formatExportSpecs(lastEstimate)
    : estimatePreview
      ? formatExportSpecs(estimatePreview)
      : null;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <label className="block">
        <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
          Embedded format
        </span>
        <select
          className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 text-sm sm:min-h-0"
          value={format}
          onChange={(e) => setFormat(e.target.value as ImageFormat)}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-10 items-center gap-2 text-[0.68rem] sm:min-h-0">
        <input
          type="checkbox"
          checked={enableFallback}
          onChange={(e) => setEnableFallback(e.target.checked)}
        />
        WebP fallback (AVIF exports)
      </label>
      {specs && <SpecTable rows={specs} />}
      {originalByteSize && !specs && (
        <p className="text-[0.68rem] text-[var(--muted)]">
          Source {formatBytes(originalByteSize)} — convert before export to reduce
          artifact size.
        </p>
      )}
      <button
        type="button"
        disabled={!imageSrc || exporting}
        onClick={handleExport}
        className="w-full border border-[var(--border)] py-3 text-[0.68rem] tracking-[0.14em] uppercase transition-colors hover:border-[var(--foreground)] disabled:opacity-30 sm:py-2"
      >
        {exporting ? "Preparing export..." : "Export standalone HTML"}
      </button>
    </div>
  );
}

