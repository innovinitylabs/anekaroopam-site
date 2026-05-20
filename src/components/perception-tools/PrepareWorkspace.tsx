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
  const [compareView, setCompareView] = useState<"split" | "original" | "converted">(
    "split",
  );

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
    const run = async () => {
      const result = await analyzeImage(
        sourceFile ?? sourceUrl!,
        sourceFile?.size,
      );
      setAnalysis(result);
    };
    run();
  }, [sourceFile, sourceUrl]);

  const handleImport = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceUrl(url);
    setConverted(null);
    setFallbackWebp(null);
    setOptions((o) => ({
      ...o,
      filename: file.name.replace(/\.[^.]+$/, ""),
    }));
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

  const runConversion = async () => {
    if (!sourceFile && !sourceUrl) return;
    setConverting(true);
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
    } finally {
      setConverting(false);
    }
  };

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
    <div className="min-h-[100dvh] pt-20 pb-16">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <header className="mb-12 border-b border-[var(--border)] pb-8">
          <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
            Perceptual preparation
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight md:text-4xl">
            Conservation lab
          </h1>
          <p className="mt-4 max-w-2xl text-[0.9rem] leading-relaxed text-[var(--muted)]">
            Optimize, convert, and export artworks for rotational viewing. Preserves
            emergent line work and watercolor gradients for archival and perceptual
            distribution.
          </p>
          <nav className="mt-6 flex flex-wrap gap-6 text-[0.62rem] tracking-[0.18em] uppercase">
            <Link href="/perceive" className="opacity-50 hover:opacity-90">
              Orientation system
            </Link>
            <span className="opacity-30">Prepare</span>
          </nav>
        </header>

        {!sourceUrl ? (
          <ImageDropZone
            dragOver={dragOver}
            onDragOver={setDragOver}
            onImport={handleImport}
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-8">
              <PanelSection
                title="Compare"
                subtitle="Original against converted output"
              >
                <div className="mb-4 flex gap-2 text-[0.62rem] tracking-[0.14em] uppercase">
                  {(["split", "original", "converted"] as const).map((v) => (
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
                      {v}
                    </button>
                  ))}
                </div>
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
                        className="mx-auto max-h-[320px] w-auto object-contain"
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
                          className="mx-auto max-h-[320px] w-auto object-contain"
                        />
                      ) : (
                        <p className="py-16 text-center text-[0.75rem] text-[var(--muted)]">
                          Run conversion to preview
                        </p>
                      )}
                    </figure>
                  )}
                </div>
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

            <aside className="space-y-6">
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
                  disabled={converting}
                  onClick={runConversion}
                  className="mt-6 w-full border border-[var(--ink)] py-2.5 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
                >
                  {converting ? "Processing..." : "Convert"}
                </button>
                {converted && analysis && (
                  <SpecTable
                    className="mt-4"
                    rows={[
                      {
                        label: "Converted size",
                        value: formatBytes(converted.stats.byteSize),
                      },
                      {
                        label: "Ratio",
                        value: `${converted.compressionRatio}%`,
                      },
                      {
                        label: "Time",
                        value: `${converted.processingMs} ms`,
                      },
                    ]}
                  />
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
                    Open from the{" "}
                    <Link href="/perceive" className="underline">
                      orientation system
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
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
