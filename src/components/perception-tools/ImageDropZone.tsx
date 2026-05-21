"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isHeicLike, isLikelyBrowserDecodable } from "@/lib/image-processing/decode-source";

function isAcceptedImage(file: File): boolean {
  if (isHeicLike(file) || isLikelyBrowserDecodable(file)) return true;
  return file.type.startsWith("image/");
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputKey, setInputKey] = useState(0);

  const acceptFile = (file: File) => {
    if (!isAcceptedImage(file)) return;
    onImport(file);
    setInputKey((k) => k + 1);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

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
        Import source artwork
      </span>
      <span className="mt-2 max-w-sm text-[0.75rem] leading-relaxed opacity-60">
        JPEG, PNG, WebP, AVIF, GIF, BMP, SVG, HEIC/HEIF, and other browser-readable images
      </span>
    </label>
  );
}
