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

const LATIN_ROTATE_OUT = -18;
const TAMIL_ROTATE_IN = 16;

/** Tamil only: Anek Tamil, optical size/spacing (Latin has no transform in idle state). */
const tamilGlyphClass =
  "font-anek-tamil font-medium leading-none pr-[0.1em]";

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

  const transition = {
    duration: reduceMotion ? 0.12 : DURATION,
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
        className="wordmark-initial relative inline-block h-[1em] w-[0.94em] shrink-0 overflow-visible leading-none"
        aria-hidden
      >
        <motion.span
          className="latin-a absolute left-0 top-0 z-10 origin-center leading-none"
          initial={false}
          animate={{
            opacity: showTamil ? 0 : 1,
            rotate: reduceMotion ? 0 : showTamil ? LATIN_ROTATE_OUT : 0,
          }}
          transition={transition}
        >
          {BRAND.latinInitial}
        </motion.span>

        <motion.span
          className={cn(
            "tamil-a absolute left-0 top-0 z-20 origin-center leading-none will-change-transform",
            tamilGlyphClass,
          )}
          initial={false}
          animate={{
            opacity: showTamil ? 1 : 0,
            rotate: reduceMotion ? 0 : showTamil ? 0 : TAMIL_ROTATE_IN,
            scale: 1.08,
            y: 1,
          }}
          transition={transition}
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
