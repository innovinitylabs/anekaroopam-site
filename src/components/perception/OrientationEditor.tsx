"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ExportPayload, PerceptionArtwork } from "@/lib/perception/types";
import { downloadJson } from "@/lib/perception/export-html";
import { usePerceiveWorkspace } from "@/lib/perception/workspace";
import type { OrientationArtworkController } from "@/lib/perception/use-orientation-artwork";
import { ExportHtmlSection } from "./ExportHtmlSection";
import { PerceptionCanvas } from "./PerceptionCanvas";
import {
  BackgroundPanel,
  ImportZone,
  MetadataPanelSection,
  PerceptualStatesPanel,
} from "./OrientationPanels";

/**
 * Orient stage for Pattarai — consumes shared PerceiveWorkspace.
 * Admin ingestion continues to use useOrientationArtwork separately.
 */
export function OrientationEditor() {
  const {
    state,
    dispatch,
    resolved,
    importFile,
    clearSource,
  } = usePerceiveWorkspace();
  const [panelVisible, setPanelVisible] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const artworkRef = useRef(state.artwork);
  const customBgRef = useRef(state.customBackground);
  useEffect(() => {
    artworkRef.current = state.artwork;
    customBgRef.current = state.customBackground;
  }, [state.artwork, state.customBackground]);

  const setArtwork = useCallback(
    (
      next:
        | PerceptionArtwork
        | ((prev: PerceptionArtwork) => PerceptionArtwork),
    ) => {
      const resolvedArtwork =
        typeof next === "function" ? next(artworkRef.current) : next;
      dispatch({ type: "SET_ARTWORK", artwork: resolvedArtwork });
    },
    [dispatch],
  );

  const setCustomBg = useCallback(
    (hex: string | ((prev: string) => string)) => {
      const next =
        typeof hex === "function" ? hex(customBgRef.current) : hex;
      dispatch({ type: "SET_CUSTOM_BACKGROUND", hex: next });
    },
    [dispatch],
  );

  const controller: OrientationArtworkController = useMemo(
    () => ({
      artwork: state.artwork,
      setArtwork,
      customBg: state.customBackground,
      setCustomBg,
      panelVisible,
      setPanelVisible,
      dragOver,
      setDragOver,
      updateState: (id, patch) =>
        dispatch({ type: "UPDATE_STATE", id, patch }),
      addState: () => dispatch({ type: "ADD_STATE" }),
      removeState: (id) => dispatch({ type: "REMOVE_STATE", id }),
      handleImport: async (file) => importFile(file),
      clearImport: () => clearSource(),
      resolvedArtwork: resolved,
      setBackground: (key) => dispatch({ type: "SET_BACKGROUND", key }),
      uploadDraftId: state.workspaceId,
    }),
    [
      state.artwork,
      state.customBackground,
      state.workspaceId,
      setArtwork,
      setCustomBg,
      panelVisible,
      dragOver,
      dispatch,
      importFile,
      clearSource,
      resolved,
    ],
  );

  const handleExportJson = () => {
    const payload: ExportPayload = {
      version: 1,
      artwork: resolved,
      exportedAt: new Date().toISOString(),
    };
    downloadJson("orientation-config.json", payload);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <div className="relative min-h-[46svh] flex-[0_0_52svh] lg:min-h-0 lg:flex-1">
        {state.artwork.imageSrc ? (
          <PerceptionCanvas
            artwork={resolved}
            mode="editor-preview"
            onInteraction={() => setPanelVisible(true)}
          />
        ) : (
          <ImportZone
            dragOver={dragOver}
            onDragOver={setDragOver}
            onImport={(file) => void importFile(file)}
          />
        )}
        {state.source && !state.artwork.imageSrc && (
          <p className="absolute inset-x-4 bottom-4 z-10 border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[0.68rem] text-[var(--muted)]">
            Source metadata restored after reload — re-import the image file to
            continue.
          </p>
        )}
        {state.artwork.imageSrc && (
          <button
            type="button"
            onClick={() => setPanelVisible((v) => !v)}
            title={
              panelVisible
                ? "Hide the metadata and states panel on this screen."
                : "Show metadata, states, background, and export controls."
            }
            className="absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-20 border-t border-[var(--border)] px-1 py-3 text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)] lg:hidden"
          >
            {panelVisible ? "Hide record" : "Show record"}
          </button>
        )}
      </div>

      <aside
        className={`flex flex-col border-t border-[var(--border)] bg-[var(--surface)] transition-all duration-500 lg:h-full lg:w-[22rem] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-l ${
          panelVisible
            ? "max-h-[48svh] min-h-0 opacity-100 lg:max-h-none lg:flex-1"
            : "max-h-0 overflow-hidden opacity-0 lg:max-h-none lg:opacity-100"
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-sm sm:p-6">
          {!state.artwork.imageSrc && (
            <div className="hidden lg:block">
              <ImportZone
                compact
                dragOver={dragOver}
                onDragOver={setDragOver}
                onImport={(file) => void importFile(file)}
              />
            </div>
          )}

          <MetadataPanelSection controller={controller} />
          <PerceptualStatesPanel controller={controller} />
          <BackgroundPanel controller={controller} />

          <section className="mt-8 space-y-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
              Export
            </h2>
            <Link
              href="/perceive/tools/prepare"
              title="Open Prepare for advanced encoding, comparison, and sizing. Workspace state is shared."
              className={`block w-full border border-[var(--border)] py-3 text-center text-[0.68rem] tracking-[0.14em] uppercase sm:py-2 ${
                state.artwork.imageSrc || state.source
                  ? "hover:border-[var(--foreground)]"
                  : "pointer-events-none opacity-30"
              }`}
            >
              Open Prepare
            </Link>
            {(state.artwork.imageSrc || state.source) && (
              <ExportHtmlSection compact />
            )}
            <button
              type="button"
              disabled={!state.artwork.imageSrc}
              title="Download orientation settings as JSON without the embedded image."
              onClick={handleExportJson}
              className="block w-full border border-[var(--border)] py-3 text-[0.68rem] tracking-[0.14em] uppercase disabled:opacity-30 sm:py-2"
            >
              Configuration JSON
            </button>
            {state.artwork.imageSrc && (
              <button
                type="button"
                onClick={clearSource}
                className="block w-full py-2 text-[0.62rem] tracking-[0.14em] uppercase opacity-50 hover:opacity-90"
              >
                Clear source
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
