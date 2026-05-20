"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { motion } from "framer-motion";
import type { PerceptionArtwork } from "@/lib/perception/types";
import {
  clampZoom,
  defaultTransform,
  easeOutCubic,
  getActiveState,
  lerpAngle,
  normalizeAngle,
  rotateByDirection,
} from "@/lib/perception/engine";
import { resolveBackground, foregroundForBackground } from "@/lib/perception/backgrounds";
import { PerceptionMetadata } from "./PerceptionMetadata";
import { cn } from "@/lib/utils";

interface PerceptionCanvasProps {
  artwork: PerceptionArtwork;
  mode?: "runtime" | "editor-preview";
  className?: string;
  onAngleChange?: (angle: number) => void;
  onInteraction?: () => void;
}

export function PerceptionCanvas({
  artwork,
  mode = "runtime",
  className,
  onAngleChange,
  onInteraction,
}: PerceptionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(() =>
    defaultTransform(artwork.initialAngle ?? 0),
  );
  const [uiVisible, setUiVisible] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const bgColor = resolveBackground(artwork.background);
  const fgColor = foregroundForBackground(bgColor);
  const activeState = getActiveState(transform.angle, artwork.states);

  const pulseUi = useCallback(() => {
    setUiVisible(true);
    onInteraction?.();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setUiVisible(false), 3200);
  }, [onInteraction]);

  const animateToAngle = useCallback(
    (target: number) => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const from = transform.angle;
      const start = performance.now();
      const duration = 680;

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        const next = lerpAngle(from, target, eased);
        setTransform((prev) => ({ ...prev, angle: next }));
        onAngleChange?.(next);
        if (t < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          const final = normalizeAngle(target);
          setTransform((prev) => ({ ...prev, angle: final }));
          onAngleChange?.(final);
        }
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [transform.angle, onAngleChange],
  );

  const rotate = useCallback(
    (direction: "cw" | "ccw") => {
      const nextAngle = rotateByDirection(transform, direction, artwork.states, {
        snapToState: artwork.snapToState,
      });
      animateToAngle(nextAngle);
      pulseUi();
    },
    [animateToAngle, artwork.snapToState, artwork.states, pulseUi, transform],
  );

  const resetView = useCallback(() => {
    setTransform({
      angle: artwork.initialAngle ?? 0,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    animateToAngle(artwork.initialAngle ?? 0);
    pulseUi();
  }, [animateToAngle, artwork.initialAngle, pulseUi]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      rotate(x < rect.width / 2 ? "ccw" : "cw");
    },
    [rotate],
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      setTransform((prev) => ({
        ...prev,
        zoom: clampZoom(prev.zoom + (e.deltaY < 0 ? 0.08 : -0.08)),
      }));
      pulseUi();
    },
    [pulseUi],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.detail > 1) return;
      draggingRef.current = false;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) draggingRef.current = true;
      if (!draggingRef.current) return;
      setTransform((prev) => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      pulseUi();
    },
    [pulseUi],
  );

  const handlePointerUp = useCallback(() => {
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") rotate("ccw");
      if (e.key === "ArrowRight") rotate("cw");
      if (e.key === "+" || e.key === "=") {
        setTransform((prev) => ({ ...prev, zoom: clampZoom(prev.zoom + 0.1) }));
        pulseUi();
      }
      if (e.key === "-") {
        setTransform((prev) => ({ ...prev, zoom: clampZoom(prev.zoom - 0.1) }));
        pulseUi();
      }
      if (e.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pulseUi, resetView, rotate]);

  useEffect(() => {
    pulseUi();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [pulseUi]);

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden select-none touch-none",
        mode === "runtime" ? "cursor-crosshair" : "cursor-crosshair",
        className,
      )}
      style={{ backgroundColor: bgColor, color: fgColor }}
      onClick={handleClick}
      onDoubleClick={(e) => {
        e.preventDefault();
        resetView();
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="application"
      aria-label={`Orientation interface for ${artwork.metadata.title}`}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          style={{
            x: transform.panX,
            y: transform.panY,
            scale: transform.zoom,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <motion.img
            src={artwork.imageSrc}
            alt={artwork.metadata.title}
            className="max-h-[88vmin] max-w-[88vmin] pointer-events-none"
            style={{ rotate: transform.angle }}
            draggable={false}
          />
        </motion.div>
      </div>

      {artwork.showMetadataOverlay !== false && (
        <PerceptionMetadata
          artwork={artwork}
          activeState={activeState}
          visible={uiVisible}
          foreground={fgColor}
        />
      )}

      <motion.p
        className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[0.62rem] tracking-[0.22em] uppercase"
        animate={{ opacity: uiVisible ? 0.35 : 0 }}
        transition={{ duration: 0.4 }}
      >
        Orientation is emergent
      </motion.p>
    </motion.div>
  );
}
