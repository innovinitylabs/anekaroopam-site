"use client";

import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const REST = BRAND.name.slice(1);
const EASE = [0.28, 1, 0.36, 1] as const;
const DURATION = 0.4;
const HOVER_DELAY_MS = 120;

const LATIN_ROTATE_OUT = -22;
const TAMIL_ROTATE_IN = 24;

/** Tamil only: Anek Tamil, optical size/spacing (Latin has no transform in idle state). */
const tamilGlyphClass =
  "font-anek-tamil font-medium leading-none pr-[0.12em]";

type AnekaroopamWordmarkProps = {
  className?: string;
};

/**
 * Identity wordmark: leading Latin "A" shifts to Tamil "அ" (Anek Tamil) on hover.
 * Fixed-width stack keeps Tamil metrics out of the line box; Latin reads as normal serif until transition.
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

  const rotationTransition = {
    duration: reduceMotion ? 0.12 : DURATION,
    ease: EASE,
  };

  const latinOpacityTransition = {
    duration: reduceMotion ? 0.08 : showTamil ? 0.18 : 0.24,
    ease: EASE,
  };

  const tamilOpacityTransition = {
    duration: reduceMotion ? 0.08 : showTamil ? 0.28 : 0.18,
    delay: reduceMotion || !showTamil ? 0 : 0.1,
    ease: EASE,
  };

  return (
    <span
      className={cn("inline-flex items-center leading-none", className)}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span
        className="wordmark-initial relative inline-block h-[1em] w-[1.1em] shrink-0 overflow-visible leading-none"
        aria-hidden
      >
        <motion.span
          className="latin-a absolute bottom-0 left-0 z-10 origin-bottom-left leading-none"
          initial={false}
          animate={{
            opacity: showTamil ? 0 : 1,
            rotate: reduceMotion ? 0 : showTamil ? LATIN_ROTATE_OUT : 0,
            x: reduceMotion ? 0 : showTamil ? -1 : 0,
          }}
          transition={{
            rotate: rotationTransition,
            x: rotationTransition,
            opacity: latinOpacityTransition,
          }}
        >
          {BRAND.latinInitial}
        </motion.span>

        <motion.span
          className={cn(
            "tamil-a absolute bottom-0 left-0 z-20 origin-bottom-left leading-none will-change-transform",
            tamilGlyphClass,
          )}
          initial={false}
          animate={{
            opacity: showTamil ? 1 : 0,
            rotate: reduceMotion ? 0 : showTamil ? 0 : TAMIL_ROTATE_IN,
            scale: 1.08,
            x: reduceMotion ? 0 : showTamil ? 0 : -2,
            y: 1,
          }}
          transition={{
            rotate: rotationTransition,
            scale: rotationTransition,
            x: rotationTransition,
            y: rotationTransition,
            opacity: tamilOpacityTransition,
          }}
        >
          {BRAND.tamilInitial}
        </motion.span>
      </span>

      <span className="leading-none" aria-hidden>
        {REST}
      </span>
    </span>
  );
}
