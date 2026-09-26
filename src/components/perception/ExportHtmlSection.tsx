"use client";

import { useMemo, useState } from "react";
import {
  conversionToEmbedded,
  downloadStandaloneArtifact,
} from "@/lib/export-engine/pipeline";
import {
  estimateHtmlExport,
  formatExportSpecs,
} from "@/lib/html-export/estimate";
import type { StandaloneExportProfile } from "@/lib/html-export/standalone-profile";
import { usePerceiveWorkspace } from "@/lib/perception/workspace";
import { SpecTable } from "@/components/perception-tools/SpecTable";

interface ExportHtmlSectionProps {
  compact?: boolean;
}

/**
 * Canonical Pattarai export surface — uses shared workspace prepared master.
 */
export function ExportHtmlSection({ compact }: ExportHtmlSectionProps) {
  const {
    state,
    dispatch,
    resolved,
    isPreparedValid,
    ensurePreparedBundle,
  } = usePerceiveWorkspace();
  const [busy, setBusy] = useState(false);

  const estimatePreview = useMemo(() => {
    const avif = state.preparation.preparedAvif;
    if (!avif) return null;
    const embedded = conversionToEmbedded(avif);
    const fallbacks = state.preparation.preparedWebp
      ? [conversionToEmbedded(state.preparation.preparedWebp)]
      : [];
    return estimateHtmlExport(
      embedded,
      state.preparation.analysis?.stats.byteSize ??
        state.source?.byteSize ??
        avif.stats.byteSize * 4,
      fallbacks,
    );
  }, [state.preparation, state.source]);

  const displayEstimate = state.export.lastEstimate ?? estimatePreview;
  const specs = displayEstimate ? formatExportSpecs(displayEstimate) : null;

  const onExport = async () => {
    if (!state.artwork.imageSrc && !state.source?.objectUrl) return;
    setBusy(true);
    dispatch({ type: "SET_EXPORT_STATUS", status: "exporting", error: null });
    try {
      const prepared = await ensurePreparedBundle();
      if (!prepared) {
        dispatch({
          type: "SET_EXPORT_STATUS",
          status: "error",
          error: "Preparation failed",
        });
        return;
      }

      const estimate = estimateHtmlExport(
        conversionToEmbedded(prepared.avif),
        prepared.sourceBytes ?? prepared.avif.stats.byteSize * 4,
        prepared.webp ? [conversionToEmbedded(prepared.webp)] : [],
      );

      downloadStandaloneArtifact({
        payload: {
          version: 1,
          artwork: { ...resolved, imageSrc: prepared.avif.dataUrl },
          exportedAt: new Date().toISOString(),
        },
        conversion: prepared.avif,
        fallbacks: prepared.webp ? [prepared.webp] : undefined,
        filename: prepared.filename,
        profile: prepared.profile,
      });

      dispatch({
        type: "SET_EXPORT_RESULT",
        estimate,
        htmlByteSize: estimate.finalHtmlSize,
      });
    } catch (err) {
      dispatch({
        type: "SET_EXPORT_STATUS",
        status: "error",
        error: err instanceof Error ? err.message : "Export failed",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <label className="block">
        <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
          Export profile
        </span>
        <select
          title="On-chain: AVIF only. Compatible: AVIF with WebP fallback."
          className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 text-sm sm:min-h-0"
          value={state.export.profile}
          onChange={(e) =>
            dispatch({
              type: "SET_EXPORT_PROFILE",
              profile: e.target.value as StandaloneExportProfile,
            })
          }
        >
          <option value="compatible">Compatible (AVIF + WebP)</option>
          <option value="onchain">On-chain (AVIF only)</option>
        </select>
      </label>
      {specs && <SpecTable rows={specs} />}
      {state.source?.byteSize && !specs && (
        <p className="text-[0.68rem] text-[var(--muted)]">
          Source ready — export will prepare AVIF
          {state.export.profile === "compatible" ? " + WebP" : ""} once if needed.
        </p>
      )}
      {state.preparation.error && (
        <p className="text-[0.68rem] text-red-700/90">
          {state.preparation.error}
        </p>
      )}
      {state.export.error && (
        <p className="text-[0.68rem] text-red-700/90">{state.export.error}</p>
      )}
      <p className="text-[0.62rem] leading-relaxed text-[var(--muted)]">
        {isPreparedValid
          ? "Using prepared master from workspace (no reconvert)."
          : state.preparation.status === "stale"
            ? "Prepared output is stale — export will reconvert."
            : "Export prepares AVIF into the shared workspace, then builds standalone HTML."}
      </p>
      <button
        type="button"
        disabled={
          busy ||
          state.export.status === "exporting" ||
          (!state.artwork.imageSrc && !state.source?.objectUrl)
        }
        title="Build a self-contained HTML file with the shared Perception runtime."
        onClick={() => void onExport()}
        className="w-full border border-[var(--border)] py-3 text-[0.68rem] tracking-[0.14em] uppercase transition-colors hover:border-[var(--foreground)] disabled:opacity-30 sm:py-2"
      >
        {busy || state.export.status === "exporting"
          ? "Preparing export..."
          : state.export.profile === "compatible"
            ? "Export compatible HTML"
            : "Export standalone HTML"}
      </button>
    </div>
  );
}
