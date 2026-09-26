"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  ConversionOptions,
  ExportPresetId,
  ImageFormat,
} from "@/lib/image-processing/types";
import { analyzeImage, formatBytes } from "@/lib/image-processing";
import { EXPORT_PRESETS, getPreset } from "@/lib/image-processing/presets";
import { downloadConvertedImage } from "@/lib/export-engine/pipeline";
import { usePerceiveWorkspace } from "@/lib/perception/workspace";
import { ExportHtmlSection } from "@/components/perception/ExportHtmlSection";
import { PanelSection } from "./PanelSection";
import { SpecTable } from "./SpecTable";
import { ImageDropZone } from "./ImageDropZone";
import { ImageCompareSlider } from "./ImageCompareSlider";

const FORMATS: ImageFormat[] = ["avif", "webp", "png", "jpeg"];

export function PrepareWorkspace() {
  const {
    state,
    dispatch,
    resolved,
    importFile,
    clearSource,
    ensurePreparedBundle,
  } = usePerceiveWorkspace();

  const [dragOver, setDragOver] = useState(false);
  const [compareView, setCompareView] = useState<
    "split" | "slider" | "original" | "converted"
  >("split");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const sourceUrl = state.source?.objectUrl ?? null;
  const needsReimport = Boolean(state.source && !state.source.objectUrl);
  const options = state.preparation.options;
  const presetId = state.preparation.presetId;
  const analysis = state.preparation.analysis;
  const converted = state.preparation.preparedAvif;
  const converting = state.preparation.status === "converting";
  const conversionError =
    state.preparation.status === "error" ? state.preparation.error : null;

  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    const run = async () => {
      try {
        setAnalysisError(null);
        const result = await analyzeImage(
          sourceUrl,
          state.source?.byteSize,
        );
        if (!cancelled) {
          dispatch({ type: "SET_ANALYSIS", analysis: result });
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: "SET_ANALYSIS", analysis: null });
          setAnalysisError(
            err instanceof Error ? err.message : "Could not analyze image",
          );
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, state.source?.byteSize, dispatch]);

  const handleImport = useCallback(
    (file: File) => {
      setAnalysisError(null);
      importFile(file);
    },
    [importFile],
  );

  const applyPreset = (id: ExportPresetId) => {
    const preset = getPreset(id);
    dispatch({
      type: "SET_PRESET",
      presetId: id,
      options: {
        ...options,
        ...preset.options,
        filename: options.filename,
        format: "avif",
      },
    });
  };

  const patchOptions = (patch: Partial<ConversionOptions>) => {
    dispatch({
      type: "SET_OPTIONS",
      options: {
        ...options,
        ...patch,
        // Prepared master stays AVIF-focused for shared workspace fingerprints.
        format: "avif",
      },
    });
  };

  const runConversion = useCallback(async () => {
    if (!sourceUrl) return;
    await ensurePreparedBundle();
  }, [sourceUrl, ensurePreparedBundle]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      {!sourceUrl ? (
        <div className="flex flex-1 items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-md space-y-4">
            {needsReimport && (
              <p className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[0.78rem] leading-relaxed text-[var(--muted)]">
                Source metadata was restored after reload — re-import the image
                file to continue. Workspace is shared with{" "}
                <Link href="/perceive" className="underline">
                  Orient
                </Link>
                ; no session save is needed.
              </p>
            )}
            <ImageDropZone
              dragOver={dragOver}
              onDragOver={setDragOver}
              onImport={handleImport}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-[1_1_58%] overflow-y-auto overscroll-contain p-5 sm:p-6 md:p-8">
            <div className="mx-auto max-w-3xl space-y-6 md:space-y-8">
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
                      className={`min-h-9 border px-2 py-1 ${
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
                    onRequestConvert={() => void runConversion()}
                  />
                ) : (
                  <div
                    className={`grid gap-4 ${
                      compareView === "split" ? "md:grid-cols-2" : "grid-cols-1"
                    }`}
                  >
                    {(compareView === "split" || compareView === "original") && (
                      <figure className="border border-[var(--border)] bg-[var(--paper)] p-3 sm:p-4">
                        <figcaption className="mb-3 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Original
                        </figcaption>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sourceUrl}
                          alt="Original"
                          className="mx-auto max-h-[min(58vh,720px)] w-auto max-w-full object-contain md:max-h-[min(70vh,720px)]"
                        />
                      </figure>
                    )}
                    {(compareView === "split" ||
                      compareView === "converted") && (
                      <figure className="border border-[var(--border)] bg-[var(--paper)] p-3 sm:p-4">
                        <figcaption className="mb-3 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Converted
                          {converted ? ` (${converted.format})` : ""}
                        </figcaption>
                        {converted ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={converted.dataUrl}
                            alt="Converted"
                            className="mx-auto max-h-[min(58vh,720px)] w-auto max-w-full object-contain md:max-h-[min(70vh,720px)]"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={converting}
                            onClick={() => void runConversion()}
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

          <aside className="flex max-h-[44svh] w-full flex-col border-t border-[var(--border)] bg-[var(--surface)] lg:h-full lg:max-h-none lg:w-[22rem] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-l">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:p-6 lg:space-y-6">
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
                      value="avif"
                      disabled
                      title="Prepared master is always AVIF"
                    >
                      {FORMATS.map((f) => (
                        <option
                          key={f}
                          value={f}
                          disabled={
                            f !== "avif" ||
                            Boolean(analysis && !analysis.formatSupport[f])
                          }
                        >
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[0.65rem] leading-relaxed text-[var(--muted)]">
                      Prepared master is AVIF (libavif / WebAssembly) for the
                      shared workspace. Large images may take longer to encode.
                    </p>
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
                        patchOptions({ quality: Number(e.target.value) })
                      }
                      className="mt-2 w-full"
                    />
                  </label>
                  <label className="flex min-h-10 items-center gap-2 text-[0.68rem] sm:min-h-0">
                    <input
                      type="checkbox"
                      checked={options.lossless}
                      onChange={(e) =>
                        patchOptions({ lossless: e.target.checked })
                      }
                    />
                    Lossless (PNG / WebP)
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[0.62rem] uppercase tracking-wide text-[var(--muted)]">
                        Max width
                      </span>
                      <input
                        type="number"
                        className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 sm:min-h-0"
                        placeholder="native"
                        value={options.maxWidth ?? ""}
                        onChange={(e) =>
                          patchOptions({
                            maxWidth: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-[0.62rem] uppercase tracking-wide text-[var(--muted)]">
                        Max height
                      </span>
                      <input
                        type="number"
                        className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 sm:min-h-0"
                        placeholder="native"
                        value={options.maxHeight ?? ""}
                        onChange={(e) =>
                          patchOptions({
                            maxHeight: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                      Chroma
                    </span>
                    <select
                      className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 sm:min-h-0"
                      value={options.chromaSubsampling}
                      onChange={(e) =>
                        patchOptions({
                          chromaSubsampling: e.target
                            .value as ConversionOptions["chromaSubsampling"],
                        })
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
                      className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 sm:min-h-0"
                      value={options.filename}
                      onChange={(e) =>
                        patchOptions({ filename: e.target.value })
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={converting || Boolean(analysisError)}
                  onClick={() => void runConversion()}
                  className="mt-6 w-full border border-[var(--ink)] py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40 sm:py-2.5"
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
                              value: `Requested ${converted.requestedFormat.toUpperCase()}; encoded as ${converted.format.toUpperCase()}`,
                            },
                          ]
                        : []),
                      ...(converted.encodedWithWasm
                        ? [
                            {
                              label: "Encoder",
                              value: "libavif (WASM)",
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
                    HEIC/HEIF was decoded before re-encoding to your chosen
                    format.
                  </p>
                )}
                {converted && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadConvertedImage(converted, options.filename)
                    }
                    className="mt-3 w-full border border-[var(--border)] py-3 text-[0.62rem] tracking-[0.14em] uppercase sm:py-2"
                  >
                    Download {converted.format.toUpperCase()}
                  </button>
                )}
              </PanelSection>

              <PanelSection
                title="HTML artifact"
                subtitle="Standalone orientation export"
              >
                <ExportHtmlSection />
                <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--muted)]">
                  Edit perceptual states in{" "}
                  <Link href="/perceive" className="underline">
                    Orient
                  </Link>
                  . Workspace is shared — no session save needed.
                  {resolved.metadata.title
                    ? ` Current title: ${resolved.metadata.title}.`
                    : ""}
                </p>
              </PanelSection>

              <button
                type="button"
                onClick={clearSource}
                className="w-full py-3 text-[0.62rem] tracking-[0.16em] uppercase opacity-50 hover:opacity-90 sm:py-2"
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
