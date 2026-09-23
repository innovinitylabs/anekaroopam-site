"use client";

import { useRef, useState } from "react";
import type { BackgroundPreset, PerceptualState } from "@/lib/perception/types";
import { BACKGROUND_PRESETS } from "@/lib/perception/backgrounds";
import { ArtworkMetadataPanel } from "./ArtworkMetadataPanel";
import type { OrientationArtworkController } from "@/lib/perception/use-orientation-artwork";

export function PerceptualStatesPanel({
  controller,
}: {
  controller: OrientationArtworkController;
}) {
  const { artwork, updateState, addState, removeState, setArtwork } = controller;

  return (
    <section className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
          Perceptual States
        </h2>
        <button
          type="button"
          onClick={addState}
          title="Add another named viewing angle with optional caption."
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
      <label
        title="When enabled, rotation settles on the nearest defined perceptual state."
        className="mt-4 flex items-center gap-2 text-[0.68rem] tracking-wide"
      >
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
  );
}

export function BackgroundPanel({
  controller,
}: {
  controller: OrientationArtworkController;
}) {
  const { artwork, setBackground, customBg, setCustomBg, setArtwork } = controller;

  return (
    <section className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
      <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
        Background
      </h2>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(BACKGROUND_PRESETS) as BackgroundPreset[]).map((key) => (
          <button
            key={key}
            type="button"
            title={`Set viewing background to ${BACKGROUND_PRESETS[key].label}.`}
            onClick={() => setBackground(key)}
            className={`px-2 py-1 text-[0.62rem] tracking-wide uppercase border ${
              artwork.background === key
                ? "border-[var(--ink)]"
                : "border-[var(--border)] opacity-50"
            }`}
          >
            {BACKGROUND_PRESETS[key].label}
          </button>
        ))}
      </div>
      {artwork.background === "custom" && (
        <input
          type="color"
          value={customBg}
          onChange={(e) => setCustomBg(e.target.value)}
          className="mt-2 h-8 w-full cursor-pointer border-0 bg-transparent"
        />
      )}
      <button
        type="button"
        title="Use a custom background color for preview and export."
        onClick={() => setArtwork((p) => ({ ...p, background: "custom" }))}
        className={`mt-2 text-[0.62rem] tracking-wide uppercase ${
          artwork.background === "custom" ? "opacity-100" : "opacity-40"
        }`}
      >
        Use custom color
      </button>
    </section>
  );
}

export function MetadataPanelSection({
  controller,
}: {
  controller: OrientationArtworkController;
}) {
  const { artwork, setArtwork } = controller;
  return (
    <ArtworkMetadataPanel
      metadata={artwork.metadata}
      onChange={(metadata) => setArtwork((p) => ({ ...p, metadata }))}
    />
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
          title="Remove this perceptual state from the artwork."
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

export function ImportZone({
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputKey, setInputKey] = useState(0);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith("image/") && !file.name.match(/\.(heic|heif)$/i)) {
      return;
    }
    onImport(file);
    setInputKey((k) => k + 1);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <label
      title="Import a high-resolution image to begin orientation and export."
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
        if (file) acceptFile(file);
      }}
    >
      <input
        key={inputKey}
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) acceptFile(file);
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
