"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { savePrepareSession } from "@/lib/export-engine/session";
import type {
  BackgroundPreset,
  PerceptionArtwork,
  PerceptualState,
} from "@/lib/perception/types";
import { createId } from "@/lib/perception/engine";
import { createDefaultMetadata, mergeArtworkMetadata } from "@/lib/perception/metadata";
import { ArtworkMetadataPanel } from "./ArtworkMetadataPanel";
import { BACKGROUND_PRESETS } from "@/lib/perception/backgrounds";
import { downloadJson } from "@/lib/perception/export-html";
import { ExportHtmlSection } from "./ExportHtmlSection";
import { PerceptionCanvas } from "./PerceptionCanvas";
import { fileToDataUrl } from "@/lib/utils";
import type { ExportPayload } from "@/lib/perception/types";

const defaultArtwork = (): PerceptionArtwork => ({
  id: "draft",
  metadata: createDefaultMetadata({
    year: new Date().getFullYear(),
  }),
  imageSrc: "",
  states: [
    {
      id: createId(),
      name: "",
      angle: 0,
      caption: "",
    },
  ],
  background: "paper",
  initialAngle: 0,
  snapToState: true,
  showMetadataOverlay: true,
});

export function OrientationEditor() {
  const [artwork, setArtwork] = useState<PerceptionArtwork>(defaultArtwork);
  const [customBg, setCustomBg] = useState("#e8e4dc");
  const [panelVisible, setPanelVisible] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const updateState = useCallback(
    (id: string, patch: Partial<PerceptualState>) => {
      setArtwork((prev) => ({
        ...prev,
        states: prev.states.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [],
  );

  const addState = () => {
    setArtwork((prev) => ({
      ...prev,
      states: [
        ...prev.states,
        {
          id: createId(),
          name: "",
          angle: (prev.states.length * 45) % 360,
          caption: "",
        },
      ],
    }));
  };

  const removeState = (id: string) => {
    setArtwork((prev) => ({
      ...prev,
      states: prev.states.filter((s) => s.id !== id),
    }));
  };

  const handleImport = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setArtwork((prev) => ({
      ...prev,
      imageSrc: dataUrl,
      metadata: mergeArtworkMetadata({
        ...prev.metadata,
        title:
          prev.metadata.title ||
          file.name.replace(/\.[^.]+$/, ""),
      }),
    }));
  };

  const resolvedArtwork = {
    ...artwork,
    background:
      artwork.background === "custom" ? customBg : artwork.background,
  };

  const handleExportJson = () => {
    const payload: ExportPayload = {
      version: 1,
      artwork,
      exportedAt: new Date().toISOString(),
    };
    downloadJson("orientation-config.json", payload);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <div className="relative min-h-[46svh] flex-[0_0_52svh] lg:min-h-0 lg:flex-1">
        {artwork.imageSrc ? (
          <PerceptionCanvas
            artwork={{
              ...artwork,
              background:
                artwork.background === "custom" ? customBg : artwork.background,
            }}
            mode="editor-preview"
            onInteraction={() => setPanelVisible(true)}
          />
        ) : (
          <ImportZone
            dragOver={dragOver}
            onDragOver={(v) => setDragOver(v)}
            onImport={handleImport}
          />
        )}
        {artwork.imageSrc && (
          <button
            type="button"
            onClick={() => setPanelVisible((v) => !v)}
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

          <ArtworkMetadataPanel
            metadata={artwork.metadata}
            onChange={(metadata) =>
              setArtwork((p) => ({ ...p, metadata }))
            }
          />

          <section className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                Perceptual States
              </h2>
              <button
                type="button"
                onClick={addState}
                className="text-[0.62rem] tracking-[0.14em] uppercase opacity-60 hover:opacity-100"
              >
                Add
              </button>
            </div>
            {artwork.states.map((state) => (
              <StateRow
                key={state.id}
                state={state}
                onChange={(patch) => updateState(state.id, patch)}
                onRemove={() => removeState(state.id)}
              />
            ))}
            <label className="mt-4 flex items-center gap-2 text-[0.68rem] tracking-wide">
              <input
                type="checkbox"
                checked={artwork.snapToState ?? false}
                onChange={(e) =>
                  setArtwork((p) => ({ ...p, snapToState: e.target.checked }))
                }
              />
              Snap between defined states
            </label>
          </section>

          <section className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
            <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
              Background
            </h2>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BACKGROUND_PRESETS) as BackgroundPreset[]).map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setArtwork((p) => ({ ...p, background: key }))
                    }
                    className={`px-2 py-1 text-[0.62rem] tracking-wide uppercase border ${
                      artwork.background === key
                        ? "border-[var(--ink)]"
                        : "border-[var(--border)] opacity-50"
                    }`}
                  >
                    {BACKGROUND_PRESETS[key].label}
                  </button>
                ),
              )}
            </div>
            {artwork.background === "custom" && (
              <input
                type="color"
                value={customBg}
                onChange={(e) => setCustomBg(e.target.value)}
                className="mt-2 h-8 w-full cursor-pointer border-0 bg-transparent"
              />
            )}
          </section>

          <section className="mt-8 space-y-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
              Export
            </h2>
            <Link
              href="/perceive/tools/prepare"
              onClick={() => {
                if (!artwork.imageSrc) return;
                savePrepareSession({
                  artwork: resolvedArtwork,
                  customBackground: customBg,
                  savedAt: new Date().toISOString(),
                });
              }}
              className={`block w-full border border-[var(--border)] py-3 text-center text-[0.68rem] tracking-[0.14em] uppercase sm:py-2 ${
                artwork.imageSrc ? "hover:border-[var(--foreground)]" : "pointer-events-none opacity-30"
              }`}
            >
              Open in Prepare
            </Link>
            {artwork.imageSrc && (
              <ExportHtmlSection
                artwork={resolvedArtwork}
                imageSrc={artwork.imageSrc}
                filename={
                  artwork.metadata.title.trim() ||
                  "orientation"
                }
                compact
              />
            )}
            <button
              type="button"
              disabled={!artwork.imageSrc}
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

function StateRow({
  state,
  onChange,
  onRemove,
}: {
  state: PerceptualState;
  onChange: (patch: Partial<PerceptualState>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 border border-[var(--border)] p-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-h-9 min-w-0 flex-1 bg-transparent outline-none"
          placeholder="Name (optional)"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          type="number"
          className="min-h-9 w-20 bg-transparent text-right outline-none sm:w-16"
          value={state.angle}
          onChange={(e) => onChange({ angle: Number(e.target.value) })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="min-h-9 px-2 text-[0.62rem] opacity-40 hover:opacity-100"
          aria-label="Remove state"
        >
          x
        </button>
      </div>
      <input
        className="min-h-9 w-full bg-transparent text-[0.8rem] italic opacity-80 outline-none"
        placeholder="Caption"
        value={state.caption ?? ""}
        onChange={(e) => onChange({ caption: e.target.value })}
      />
    </div>
  );
}

function ImportZone({
  dragOver,
  onDragOver,
  onImport,
  compact,
}: {
  dragOver: boolean;
  onDragOver: (v: boolean) => void;
  onImport: (file: File) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center border border-dashed border-[var(--border)] text-center transition-colors ${
        compact ? "p-6" : "absolute inset-0 m-5 sm:m-8"
      } ${dragOver ? "bg-[var(--surface-elevated)]" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(true);
      }}
      onDragLeave={() => onDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith("image/")) onImport(file);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
        }}
      />
      <span className="text-[0.68rem] tracking-[0.18em] uppercase text-[var(--muted)]">
        Import artwork
      </span>
      <span className="mt-2 max-w-xs text-[0.75rem] leading-relaxed opacity-60">
        Drag an image or select a high-resolution file
      </span>
    </label>
  );
}
