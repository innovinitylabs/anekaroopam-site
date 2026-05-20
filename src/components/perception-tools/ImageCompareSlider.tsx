"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ImageCompareSliderProps = {
  originalSrc: string;
  convertedSrc: string | null;
  converting: boolean;
  onRequestConvert: () => void;
};

export function ImageCompareSlider({
  originalSrc,
  convertedSrc,
  converting,
  onRequestConvert,
}: ImageCompareSliderProps) {
  const [posPct, setPosPct] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragging = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const p = ((clientX - r.left) / r.width) * 100;
    setPosPct(Math.min(100, Math.max(0, p)));
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  };

  const onPointerDownTrack = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-compare-control]")) return;
    if (!convertedSrc) {
      onRequestConvert();
      return;
    }
    dragging.current = true;
    rootRef.current?.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !convertedSrc) return;
    setFromClientX(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    const el = rootRef.current;
    if (el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  };

  if (!convertedSrc) {
    return (
      <button
        type="button"
        disabled={converting}
        onClick={onRequestConvert}
        className="flex min-h-[min(85vh,920px)] w-full items-center justify-center border border-[var(--border)] bg-[var(--paper)] px-6 py-16 text-center text-[0.78rem] text-[var(--muted)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {converting
          ? "Processing..."
          : "Click to run conversion and open the comparison slider"}
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`relative w-full touch-none select-none border border-[var(--border)] bg-[var(--paper)] ${
        isFullscreen ? "cursor-ew-resize" : ""
      }`}
      style={{
        minHeight: isFullscreen ? undefined : "min(85vh, 920px)",
        ...(isFullscreen ? { width: "100%", height: "100%" } : {}),
      }}
      onPointerDown={onPointerDownTrack}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center p-4 ${
          isFullscreen ? "cursor-ew-resize" : "cursor-ew-resize"
        }`}
      >
        <div
          className={`relative w-full max-w-full ${
            isFullscreen ? "h-full" : "h-[min(80vh,880px)]"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={convertedSrc}
            alt="Converted"
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
            draggable={false}
          />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              clipPath: `inset(0 ${100 - posPct}% 0 0)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalSrc}
              alt="Original"
              className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--ink)]"
        style={{ left: `${posPct}%`, transform: "translateX(-50%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] shadow-sm"
        style={{ left: `${posPct}%` }}
        role="slider"
        aria-valuenow={Math.round(posPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Compare original and converted"
      >
        <span className="flex gap-0.5" aria-hidden>
          <span className="block h-4 w-px bg-[var(--ink)]" />
          <span className="block h-4 w-px bg-[var(--ink)]" />
        </span>
      </div>

      <div
        data-compare-control
        className="pointer-events-auto absolute right-3 top-3 z-10 flex gap-2"
      >
        <button
          type="button"
          onClick={toggleFullscreen}
          className="border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)] transition-opacity hover:opacity-90"
        >
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 text-[0.58rem] tracking-[0.2em] uppercase text-[var(--muted)]">
        Original
      </div>
      <div className="pointer-events-none absolute right-3 top-12 text-[0.58rem] tracking-[0.2em] uppercase text-[var(--muted)]">
        Converted
      </div>
    </div>
  );
}
