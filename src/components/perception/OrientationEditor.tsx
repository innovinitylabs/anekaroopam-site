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
import { BACKGROUND_PRESETS } from "@/lib/perception/backgrounds";
import {
  buildStandaloneHtml,
  downloadHtml,
  downloadJson,
} from "@/lib/perception/export-html";
import { PerceptionCanvas } from "./PerceptionCanvas";
import { fileToDataUrl } from "@/lib/utils";
import type { ExportPayload } from "@/lib/perception/types";

const defaultArtwork = (): PerceptionArtwork => ({
  id: "draft",
  metadata: { title: "Untitled orientation", year: new Date().getFullYear() },
  imageSrc: "",
  states: [
    {
      id: createId(),
      name: "Emergence",
      angle: 0,
      caption: "A form waiting to be discovered.",
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
          name: "State",
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
      metadata: {
        ...prev.metadata,
        title: prev.metadata.title || file.name.replace(/\.[^.]+$/, ""),
      },
    }));
  };

  const handleExportHtml = () => {
    if (!artwork.imageSrc) return;
    const payload: ExportPayload = {
      version: 1,
      artwork: {
        ...artwork,
        background:
          artwork.background === "custom" ? customBg : artwork.background,
      },
      exportedAt: new Date().toISOString(),
    };
    const html = buildStandaloneHtml(payload);
    const slug = artwork.metadata.title.toLowerCase().replace(/\s+/g, "-");
    downloadHtml(`${slug || "orientation"}.html`, html);
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
    <div className="flex h-[100dvh] w-full flex-col lg:flex-row">
      <div className="relative min-h-[55vh] flex-1 lg:min-h-0">
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
      </div>

      <aside
        className={`border-t border-[var(--border)] bg-[var(--surface)] transition-all duration-500 lg:w-[22rem] lg:border-t-0 lg:border-l ${
          panelVisible ? "max-h-[45vh] opacity-100" : "max-h-0 overflow-hidden opacity-0 lg:max-h-none lg:opacity-100"
        }`}
      >
        <div className="h-full overflow-y-auto p-6 text-sm">
          <header className="mb-8">
            <p className="text-[0.62rem] tracking-[0.24em] uppercase text-[var(--muted)]">
              Orientation System
            </p>
            <h1 className="mt-2 font-display text-xl tracking-wide">
              Configurational Interface
            </h1>
          </header>

          {!artwork.imageSrc && (
            <ImportZone
              compact
              dragOver={dragOver}
              onDragOver={setDragOver}
              onImport={handleImport}
            />
          )}

          <section className="space-y-4 border-t border-[var(--border)] pt-6">
            <label className="block">
              <span className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                Title
              </span>
              <input
                className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1 outline-none"
                value={artwork.metadata.title}
                onChange={(e) =>
                  setArtwork((p) => ({
                    ...p,
                    metadata: { ...p.metadata, title: e.target.value },
                  }))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                  Year
                </span>
                <input
                  type="number"
                  className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1 outline-none"
                  value={artwork.metadata.year ?? ""}
                  onChange={(e) =>
                    setArtwork((p) => ({
                      ...p,
                      metadata: {
                        ...p.metadata,
                        year: Number(e.target.value) || undefined,
                      },
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                  Process
                </span>
                <input
                  className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1 outline-none"
                  value={artwork.metadata.process ?? ""}
                  onChange={(e) =>
                    setArtwork((p) => ({
                      ...p,
                      metadata: { ...p.metadata, process: e.target.value },
                    }))
                  }
                />
              </label>
            </div>
          </section>

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
                  artwork: {
                    ...artwork,
                    background:
                      artwork.background === "custom"
                        ? customBg
                        : artwork.background,
                  },
                  customBackground: customBg,
                  savedAt: new Date().toISOString(),
                });
              }}
              className={`block w-full border border-[var(--border)] py-2 text-center text-[0.68rem] tracking-[0.14em] uppercase ${
                artwork.imageSrc ? "hover:border-[var(--ink)]" : "pointer-events-none opacity-30"
              }`}
            >
              Prepare and convert
            </Link>
            <button
              type="button"
              disabled={!artwork.imageSrc}
              onClick={handleExportHtml}
              className="block w-full border border-[var(--border)] py-2 text-[0.68rem] tracking-[0.14em] uppercase disabled:opacity-30"
            >
              Standalone HTML
            </button>
            <button
              type="button"
              disabled={!artwork.imageSrc}
              onClick={handleExportJson}
              className="block w-full border border-[var(--border)] py-2 text-[0.68rem] tracking-[0.14em] uppercase disabled:opacity-30"
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
      <div className="flex gap-2">
        <input
          className="flex-1 bg-transparent outline-none"
          placeholder="Name"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          type="number"
          className="w-16 bg-transparent text-right outline-none"
          value={state.angle}
          onChange={(e) => onChange({ angle: Number(e.target.value) })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-[0.62rem] opacity-40 hover:opacity-100"
          aria-label="Remove state"
        >
          x
        </button>
      </div>
      <input
        className="w-full bg-transparent text-[0.8rem] italic opacity-80 outline-none"
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
        compact ? "p-6" : "absolute inset-0 m-8"
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
