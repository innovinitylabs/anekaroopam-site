"use client";

import { savePrepareSession } from "@/lib/export-engine/session";
import type { ExportPayload } from "@/lib/perception/types";
import { downloadJson } from "@/lib/perception/export-html";
import {
  useOrientationArtwork,
  type UseOrientationArtworkOptions,
} from "@/lib/perception/use-orientation-artwork";
import { ExportHtmlSection } from "./ExportHtmlSection";
import { PerceptionCanvas } from "./PerceptionCanvas";
import {
  BackgroundPanel,
  ImportZone,
  MetadataPanelSection,
  PerceptualStatesPanel,
} from "./OrientationPanels";
import Link from "next/link";

export type OrientationEditorProps = UseOrientationArtworkOptions;

export function OrientationEditor(props: OrientationEditorProps = {}) {
  const controller = useOrientationArtwork({
    ...props,
    uploadDraftId: props.uploadDraftId ?? props.initial?.id ?? props.value?.id,
  });
  const {
    artwork,
    customBg,
    panelVisible,
    setPanelVisible,
    dragOver,
    setDragOver,
    handleImport,
    resolvedArtwork,
  } = controller;

  const handleExportJson = () => {
    const payload: ExportPayload = {
      version: 1,
      artwork: controller.artwork,
      exportedAt: new Date().toISOString(),
    };
    downloadJson("orientation-config.json", payload);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <div className="relative min-h-[46svh] flex-[0_0_52svh] lg:min-h-0 lg:flex-1">
        {artwork.imageSrc ? (
          <PerceptionCanvas
            artwork={resolvedArtwork}
            mode="editor-preview"
            onInteraction={() => setPanelVisible(true)}
          />
        ) : (
          <ImportZone
            dragOver={dragOver}
            onDragOver={setDragOver}
            onImport={handleImport}
          />
        )}
        {artwork.imageSrc && (
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
          {!artwork.imageSrc && (
            <div className="hidden lg:block">
              <ImportZone
                compact
                dragOver={dragOver}
                onDragOver={setDragOver}
                onImport={handleImport}
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
              title="Open Prepare with this artwork for encoding, sizing, and standalone HTML export."
              onClick={() => {
                if (!artwork.imageSrc) return;
                savePrepareSession({
                  artwork: resolvedArtwork,
                  customBackground: customBg,
                  uploadDraftId: controller.uploadDraftId,
                });
              }}
              className={`block w-full border border-[var(--border)] py-3 text-center text-[0.68rem] tracking-[0.14em] uppercase sm:py-2 ${
                artwork.imageSrc
                  ? "hover:border-[var(--foreground)]"
                  : "pointer-events-none opacity-30"
              }`}
            >
              Open in Prepare
            </Link>
            {artwork.imageSrc && (
              <ExportHtmlSection
                artwork={resolvedArtwork}
                imageSrc={artwork.imageSrc}
                filename={
                  artwork.metadata.title.trim() || "orientation"
                }
                compact
              />
            )}
            <button
              type="button"
              disabled={!artwork.imageSrc}
              title="Download orientation settings as JSON without the embedded image."
              onClick={handleExportJson}
              className="block w-full border border-[var(--border)] py-3 text-[0.68rem] tracking-[0.14em] uppercase disabled:opacity-30 sm:py-2"
            >
              Configuration JSON
            </button>
          </section>
        </div>
      </aside>
    </div>
  );
}
