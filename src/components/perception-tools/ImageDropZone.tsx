"use client";

import { cn } from "@/lib/utils";

export function ImageDropZone({
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
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center border border-dashed border-[var(--border)] text-center transition-colors",
        compact ? "p-6" : "min-h-[12rem] p-10",
        dragOver && "bg-[var(--surface-elevated)]",
      )}
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
        Import source artwork
      </span>
      <span className="mt-2 max-w-sm text-[0.75rem] leading-relaxed opacity-60">
        Drag a high-resolution image for archival conversion and perceptual export
      </span>
    </label>
  );
}
