"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PerceptionArtwork } from "@/lib/perception/types";
import type {
  ConversionOptions,
  ConversionResult,
  ExportPresetId,
  ImageAnalysis,
  ImageFormat,
} from "@/lib/image-processing/types";
import {
  analyzeImage,
  convertImage,
  defaultConversionOptions,
  formatBytes,
} from "@/lib/image-processing";
import { decodeImageSource, isHeicLike } from "@/lib/image-processing/decode-source";
import { EXPORT_PRESETS, getPreset } from "@/lib/image-processing/presets";
import {
  estimateHtmlExport,
  formatExportSpecs,
} from "@/lib/html-export/estimate";
import { conversionToEmbedded } from "@/lib/export-engine/pipeline";
import {
  downloadConvertedImage,
  downloadStandaloneArtifact,
} from "@/lib/export-engine/pipeline";
import { loadPrepareSession } from "@/lib/export-engine/session";
import { PanelSection } from "./PanelSection";
import { SpecTable } from "./SpecTable";
import { ImageDropZone } from "./ImageDropZone";
import { ImageCompareSlider } from "./ImageCompareSlider";

const FORMATS: ImageFormat[] = ["avif", "webp", "png", "jpeg"];

export function PrepareWorkspace() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [options, setOptions] = useState<ConversionOptions>(
    defaultConversionOptions(),
  );
  const [presetId, setPresetId] = useState<ExportPresetId>("perceptual");
  const [converted, setConverted] = useState<ConversionResult | null>(null);
  const [fallbackWebp, setFallbackWebp] = useState<ConversionResult | null>(null);
  const [converting, setConverting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [artwork, setArtwork] = useState<PerceptionArtwork | null>(null);
  const [enableFallback, setEnableFallback] = useState(true);
  const [compareView, setCompareView] = useState<
    "split" | "slider" | "original" | "converted"
  >("split");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadPrepareSession();
    if (session?.artwork.imageSrc) {
      setArtwork(session.artwork);
      setSourceUrl(session.artwork.imageSrc);
      setOptions((o) => ({
        ...o,
        filename: session.artwork.metadata.title,
      }));
    }
  }, []);

  useEffect(() => {
    if (!sourceFile && !sourceUrl) return;
    let cancelled = false;
    const run = async () => {
      try {
        setAnalysisError(null);
        const result = await analyzeImage(
          sourceFile ?? sourceUrl!,
          sourceFile?.size,
        );
        if (!cancelled) setAnalysis(result);
      } catch (err) {
        if (!cancelled) {
          setAnalysis(null);
          setAnalysisError(
            err instanceof Error ? err.message : "Could not analyze image",
          );
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [sourceFile, sourceUrl]);

  const handleImport = useCallback(async (file: File) => {
    setAnalysisError(null);
    setConversionError(null);
    setConverted(null);
    setFallbackWebp(null);
    setSourceFile(file);
    setOptions((o) => ({
      ...o,
      filename: file.name.replace(/\.[^.]+$/, ""),
    }));

    if (isHeicLike(file)) {
      try {
        const decoded = await decodeImageSource(file);
        setSourceUrl(decoded.dataUrl);
      } catch (err) {
        setSourceUrl(null);
        setAnalysisError(
          err instanceof Error ? err.message : "HEIC decode failed",
        );
      }
      return;
    }

    setSourceUrl(URL.createObjectURL(file));
  }, []);

  const applyPreset = (id: ExportPresetId) => {
    setPresetId(id);
    const preset = getPreset(id);
    setOptions((o) => ({
      ...o,
      ...preset.options,
      filename: o.filename,
    }));
  };

  const runConversion = useCallback(async () => {
    if (!sourceFile && !sourceUrl) return;
    setConverting(true);
    setConversionError(null);
    try {
      const result = await convertImage(
        sourceFile ?? sourceUrl!,
        options,
        analysis?.stats.byteSize,
      );
      setConverted(result);

      if (
        enableFallback &&
        options.format === "avif" &&
        result.format === "avif"
      ) {
        const webp = await convertImage(
          sourceFile ?? sourceUrl!,
          { ...options, format: "webp", quality: options.quality },
          analysis?.stats.byteSize,
        );
        setFallbackWebp(webp);
      } else {
        setFallbackWebp(null);
      }
    } catch (err) {
      setConverted(null);
      setFallbackWebp(null);
      setConversionError(
        err instanceof Error ? err.message : "Conversion failed",
      );
    } finally {
      setConverting(false);
    }
  }, [
    sourceFile,
    sourceUrl,
    options,
    analysis?.stats.byteSize,
    enableFallback,
  ]);

  const htmlEstimate = useMemo(() => {
    if (!converted || !analysis) return null;
    const embedded = conversionToEmbedded(converted);
    const fallbacks = fallbackWebp ? [conversionToEmbedded(fallbackWebp)] : [];
    return estimateHtmlExport(embedded, analysis.stats.byteSize, fallbacks);
  }, [converted, fallbackWebp, analysis]);

  const exportHtml = () => {
    if (!converted) return;
    const effectiveArtwork: PerceptionArtwork = artwork ?? {
      id: "prepare-export",
      metadata: { title: options.filename || "Artwork" },
      imageSrc: converted.dataUrl,
      states: [],
      background: "paper",
      showMetadataOverlay: true,
    };
    downloadStandaloneArtifact({
      payload: {
        version: 1,
        artwork: effectiveArtwork,
        exportedAt: new Date().toISOString(),
      },
      conversion: converted,
      fallbacks: fallbackWebp ? [fallbackWebp] : undefined,
      filename: options.filename,
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      {!sourceUrl ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-md">
            <ImageDropZone
              dragOver={dragOver}
              onDragOver={setDragOver}
              onImport={handleImport}
            />
          </div>
        </div>
      ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 md:p-8">
              <div className="mx-auto max-w-3xl space-y-8">
              {analysisError && (
                <p className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[0.78rem] leading-relaxed text-red-700/90">
                  {analysisError}
                </p>
              )}
              <PanelSection
                title="Compare"
                subtitle="Original against converted output"
              >
                <div className="mb-4 flex flex-wrap gap-2 text-[0.62rem] tracking-[0.14em] uppercase">
                  {(
                    [
                      ["split", "Split"],
                      ["slider", "Slider"],
                      ["original", "Original"],
                      ["converted", "Converted"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCompareView(v)}
                      className={`px-2 py-1 border ${
                        compareView === v
                          ? "border-[var(--ink)]"
                          : "border-[var(--border)] opacity-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {compareView === "slider" ? (
                  <ImageCompareSlider
                    originalSrc={sourceUrl}
                    convertedSrc={converted?.dataUrl ?? null}
                    converting={converting}
                    onRequestConvert={runConversion}
                  />
                ) : (
                  <div
                    className={`grid gap-4 ${
                      compareView === "split" ? "md:grid-cols-2" : "grid-cols-1"
                    }`}
                  >
                    {(compareView === "split" || compareView === "original") && (
                      <figure className="border border-[var(--border)] bg-[var(--paper)] p-4">
                        <figcaption className="mb-3 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Original
                        </figcaption>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sourceUrl}
                          alt="Original"
                          className="mx-auto max-h-[min(70vh,720px)] w-auto object-contain"
                        />
                      </figure>
                    )}
                    {(compareView === "split" || compareView === "converted") && (
                      <figure className="border border-[var(--border)] bg-[var(--paper)] p-4">
                        <figcaption className="mb-3 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Converted
                          {converted ? ` (${converted.format})` : ""}
                        </figcaption>
                        {converted ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={converted.dataUrl}
                            alt="Converted"
                            className="mx-auto max-h-[min(70vh,720px)] w-auto object-contain"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={converting}
                            onClick={runConversion}
                            className="flex min-h-[200px] w-full flex-col items-center justify-center gap-2 py-12 text-center text-[0.75rem] text-[var(--muted)] transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            <span>
                              {converting
                                ? "Processing..."
                                : "Click here to run conversion and preview"}
                            </span>
                          </button>
                        )}
                      </figure>
                    )}
                  </div>
                )}
              </PanelSection>

              {analysis && (
                <PanelSection title="Analysis" subtitle="Source characteristics">
                  <div className="grid gap-6 md:grid-cols-2">
                    <SpecTable
                      rows={[
                        {
                          label: "Resolution",
                          value: `${analysis.stats.width} x ${analysis.stats.height}`,
                        },
                        {
                          label: "Aspect",
                          value: analysis.stats.aspectRatio.toFixed(3),
                        },
                        {
                          label: "MIME",
                          value: analysis.stats.mimeType || "unknown",
                        },
                        {
                          label: "Size",
                          value: formatBytes(analysis.stats.byteSize),
                        },
                        {
                          label: "Transparency",
                          value: analysis.hasTransparency ? "yes" : "no",
                        },
                        {
                          label: "Memory est.",
                          value: `${analysis.estimatedMemoryMb.toFixed(1)} MB`,
                        },
                        {
                          label: "Load est.",
                          value: analysis.loadingEstimate,
                        },
                      ]}
                    />
                    <div>
                      <p className="mb-3 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                        Dominant tones
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.dominantColors.map((c) => (
                          <span
                            key={c}
                            className="h-8 w-8 rounded-full border border-[var(--border)]"
                            style={{ background: c }}
                            title={c}
                          />
                        ))}
                      </div>
                      <p className="mt-6 mb-2 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                        Format support
                      </p>
                      <ul className="flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-wide">
                        {FORMATS.map((f) => (
                          <li
                            key={f}
                            className={`border px-2 py-0.5 ${
                              analysis.formatSupport[f]
                                ? "border-[var(--ink)]"
                                : "border-[var(--border)] opacity-40"
                            }`}
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </PanelSection>
              )}
            </div>
          </div>

          <aside className="flex w-full flex-col border-t border-[var(--border)] bg-[var(--surface)] lg:h-full lg:w-[22rem] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-l">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
              <PanelSection title="Presets" subtitle="Perceptual export modes">
                <ul className="space-y-3">
                  {EXPORT_PRESETS.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        className={`w-full border p-3 text-left transition-colors ${
                          presetId === p.id
                            ? "border-[var(--ink)] bg-[var(--surface-elevated)]"
                            : "border-[var(--border)] opacity-70 hover:opacity-100"
                        }`}
                      >
                        <span className="text-[0.68rem] tracking-[0.14em] uppercase">
                          {p.label}
                        </span>
                        <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--muted)]">
                          {p.description}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </PanelSection>

              <PanelSection title="Conversion" subtitle="Format and fidelity">
                <div className="space-y-4 text-[0.78rem]">
                  <label className="block">
                    <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                      Format
                    </span>
                    <select
                      className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1"
                      value={options.format}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          format: e.target.value as ImageFormat,
                        }))
                      }
                    >
                      {FORMATS.map((f) => (
                        <option
                          key={f}
                          value={f}
                          disabled={Boolean(analysis && !analysis.formatSupport[f])}
                        >
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    {analysis && !analysis.formatSupport.avif && (
                      <p className="mt-2 text-[0.65rem] leading-relaxed text-[var(--muted)]">
                        AVIF encoding is not available in this browser (Safari and
                        Firefox often lack it). Encoding uses the canvas API, so
                        Chromium-based browsers such as Chrome or Edge support AVIF
                        export. WebP is used as the fallback when you pick AVIF.
                      </p>
                    )}
                  </label>
                  <label className="block">
                    <span className="flex justify-between text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                      Quality
                      <span>{Math.round(options.quality * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0.4}
                      max={1}
                      step={0.01}
                      value={options.quality}
                      disabled={options.lossless && options.format === "png"}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          quality: Number(e.target.value),
                        }))
                      }
                      className="mt-2 w-full"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[0.68rem]">
                    <input
                      type="checkbox"
                      checked={options.lossless}
                      onChange={(e) =>
                        setOptions((o) => ({ ...o, lossless: e.target.checked }))
                      }
                    />
                    Lossless (PNG / WebP)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[0.62rem] uppercase tracking-wide text-[var(--muted)]">
                        Max width
                      </span>
                      <input
                        type="number"
                        className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1"
                        placeholder="native"
                        value={options.maxWidth ?? ""}
                        onChange={(e) =>
                          setOptions((o) => ({
                            ...o,
                            maxWidth: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-[0.62rem] uppercase tracking-wide text-[var(--muted)]">
                        Max height
                      </span>
                      <input
                        type="number"
                        className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1"
                        placeholder="native"
                        value={options.maxHeight ?? ""}
                        onChange={(e) =>
                          setOptions((o) => ({
                            ...o,
                            maxHeight: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                      Chroma
                    </span>
                    <select
                      className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1"
                      value={options.chromaSubsampling}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          chromaSubsampling: e.target
                            .value as ConversionOptions["chromaSubsampling"],
                        }))
                      }
                    >
                      <option value="4:4:4">4:4:4 (fine lines)</option>
                      <option value="4:2:2">4:2:2</option>
                      <option value="4:2:0">4:2:0</option>
                    </select>
                    <p className="mt-1 text-[0.65rem] opacity-50">
                      Browser encoder may apply its own subsampling.
                    </p>
                  </label>
                  <label className="block">
                    <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                      Filename
                    </span>
                    <input
                      className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1"
                      value={options.filename}
                      onChange={(e) =>
                        setOptions((o) => ({ ...o, filename: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={converting || Boolean(analysisError)}
                  onClick={runConversion}
                  className="mt-6 w-full border border-[var(--ink)] py-2.5 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
                >
                  {converting ? "Processing..." : "Convert"}
                </button>
                {conversionError && (
                  <p className="mt-3 text-[0.72rem] leading-relaxed text-red-700/90 dark:text-red-300/90">
                    {conversionError}
                  </p>
                )}
                {converted && analysis && (
                  <SpecTable
                    className="mt-4"
                    rows={[
                      {
                        label: "Source file",
                        value: formatBytes(analysis.stats.byteSize),
                      },
                      {
                        label: "Output",
                        value: `${formatBytes(converted.stats.byteSize)} (${converted.stats.mimeType})`,
                      },
                      ...(converted.requestedFormat &&
                      converted.requestedFormat !== converted.format
                        ? [
                            {
                              label: "Note",
                              value: `${converted.requestedFormat.toUpperCase()} unavailable; encoded as ${converted.format.toUpperCase()}`,
                            },
                          ]
                        : []),
                      {
                        label: "Size change",
                        value:
                          converted.compressionRatio > 0
                            ? `${converted.compressionRatio}% smaller`
                            : converted.compressionRatio < 0
                              ? `${Math.abs(converted.compressionRatio)}% larger`
                              : "No change",
                      },
                      {
                        label: "Encode time",
                        value: `${converted.processingMs} ms`,
                      },
                    ]}
                  />
                )}
                {converted?.transcodedFromHeic && (
                  <p className="mt-2 text-[0.65rem] leading-relaxed text-[var(--muted)]">
                    HEIC/HEIF was decoded before re-encoding to your chosen format.
                  </p>
                )}
                {converted && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadConvertedImage(converted, options.filename)
                    }
                    className="mt-3 w-full border border-[var(--border)] py-2 text-[0.62rem] tracking-[0.14em] uppercase"
                  >
                    Download {converted.format.toUpperCase()}
                  </button>
                )}
              </PanelSection>

              <PanelSection title="HTML artifact" subtitle="Standalone orientation export">
                <label className="mb-4 flex items-center gap-2 text-[0.68rem]">
                  <input
                    type="checkbox"
                    checked={enableFallback}
                    onChange={(e) => setEnableFallback(e.target.checked)}
                  />
                  WebP fallback when using AVIF
                </label>
                {htmlEstimate && (
                  <SpecTable rows={formatExportSpecs(htmlEstimate)} />
                )}
                <button
                  type="button"
                  disabled={!converted}
                  onClick={exportHtml}
                  className="mt-4 w-full border border-[var(--ink)] py-2.5 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
                >
                  Export standalone HTML
                </button>
                {!artwork && (
                  <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--muted)]">
                    Open from{" "}
                    <Link href="/perceive" className="underline">
                      Orient
                    </Link>{" "}
                    to include perceptual states, or import will use image only.
                  </p>
                )}
              </PanelSection>

              <button
                type="button"
                onClick={() => {
                  setSourceUrl(null);
                  setSourceFile(null);
                  setConverted(null);
                  setAnalysis(null);
                }}
                className="w-full py-2 text-[0.62rem] tracking-[0.16em] uppercase opacity-50 hover:opacity-90"
              >
                Clear source
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
