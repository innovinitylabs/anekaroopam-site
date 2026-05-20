"use client";

import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const REST = BRAND.name.slice(1);
const WHEEL_EASE = [0.34, 0, 0.21, 1] as const;
const DURATION = 0.52;
const HOVER_DELAY_MS = 120;

const WHEEL_OUT_DEG = -128;
const WHEEL_IN_START_DEG = 128;

/** Tamil only: Anek Tamil, optical weight (Latin has no idle transform). */
const tamilGlyphClass = "font-anek-tamil font-semibold leading-none";

type AnekaroopamWordmarkProps = {
  className?: string;
};

/**
 * Identity wordmark: leading Latin "A" shifts to Tamil "அ" (Anek Tamil) on hover.
 * Hybrid stack: Latin A stays in normal text flow; Tamil overlays on hover with a
 * center-pivot in-plane rotation (wheel-like), not a front/back flip.
 */
export function AnekaroopamWordmark({ className }: AnekaroopamWordmarkProps) {
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTamil = hovered;

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const onPointerEnter = useCallback(() => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setHovered(true), HOVER_DELAY_MS);
  }, [clearHoverTimer]);

  const onPointerLeave = useCallback(() => {
    clearHoverTimer();
    setHovered(false);
  }, [clearHoverTimer]);

  const onFocus = useCallback(() => {
    clearHoverTimer();
    setHovered(true);
  }, [clearHoverTimer]);

  const onBlur = useCallback(() => {
    clearHoverTimer();
    setHovered(false);
  }, [clearHoverTimer]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  const wheelTransition = {
    duration: reduceMotion ? 0.12 : DURATION,
    ease: WHEEL_EASE,
  };

  const latinOpacityTransition = {
    duration: reduceMotion ? 0.08 : showTamil ? 0.22 : 0.26,
    ease: WHEEL_EASE,
  };

  const tamilOpacityTransition = {
    duration: reduceMotion ? 0.08 : showTamil ? 0.3 : 0.2,
    delay: reduceMotion || !showTamil ? 0 : 0.14,
    ease: WHEEL_EASE,
  };

  const restWeightTransition = {
    duration: reduceMotion ? 0.08 : showTamil ? 0.32 : 0.24,
    delay: reduceMotion || !showTamil ? 0 : 0.14,
    ease: WHEEL_EASE,
  };

  return (
    <span
      className={cn("inline-flex items-baseline leading-none", className)}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span
        className="wordmark-initial relative inline-block shrink-0 overflow-visible leading-none"
        aria-hidden
      >
        <motion.span
          className="latin-a relative z-10 inline-block origin-center leading-none"
          initial={false}
          animate={{
            opacity: showTamil ? 0 : 1,
            rotate: reduceMotion ? 0 : showTamil ? WHEEL_OUT_DEG : 0,
          }}
          transition={{
            rotate: wheelTransition,
            opacity: latinOpacityTransition,
          }}
        >
          {BRAND.latinInitial}
        </motion.span>

        <span className="tamil-a absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 leading-none">
          <motion.span
            className={cn(
              "inline-block origin-center will-change-transform",
              tamilGlyphClass,
            )}
            initial={false}
            animate={{
              opacity: showTamil ? 1 : 0,
              rotate: reduceMotion ? 0 : showTamil ? 0 : WHEEL_IN_START_DEG,
              scaleX: 1.12,
              scaleY: 1.08,
              y: -0.5,
            }}
            transition={{
              rotate: wheelTransition,
              scaleX: wheelTransition,
              scaleY: wheelTransition,
              y: wheelTransition,
              opacity: tamilOpacityTransition,
            }}
          >
            {BRAND.tamilInitial}
          </motion.span>
        </span>
      </span>

      <motion.span
        className="leading-none will-change-[transform,font-weight]"
        aria-hidden
        initial={false}
        animate={{
          x: reduceMotion ? 0 : showTamil ? 4 : 0,
          fontWeight: showTamil ? 600 : 400,
        }}
        transition={{
          x: {
            ...wheelTransition,
            delay: reduceMotion || !showTamil ? 0 : 0.14,
          },
          fontWeight: restWeightTransition,
        }}
      >
        {REST}
      </motion.span>
    </span>
  );
}
