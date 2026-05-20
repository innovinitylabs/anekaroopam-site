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
  "font-anek-tamil font-medium leading-none pr-[0.09em] translate-y-[1px] scale-[1.08]";

type AnekaroopamWordmarkProps = {
  className?: string;
};

/**
 * Identity wordmark: leading Latin "A" shifts to Tamil "அ" (Anek Tamil) on hover.
 * Permanent invisible Tamil reserve preserves width; Latin reads as normal serif until transition.
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
      className={cn("inline-flex items-baseline", className)}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span
        className="wordmark-initial inline-grid shrink-0 leading-none [grid-template-areas:'stack']"
        aria-hidden
      >
        <span className="[grid-area:stack] select-none">
          <span className={cn("invisible inline-block", tamilGlyphClass)}>
            {BRAND.tamilInitial}
          </span>
        </span>

        <span className="pointer-events-none [grid-area:stack] relative flex h-full w-full items-end justify-start">
          <motion.span
            className="latin-a relative z-10 origin-bottom-left leading-none"
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
              "tamil-a absolute bottom-0 left-0 z-20 origin-bottom-left leading-none will-change-transform",
              tamilGlyphClass,
            )}
            initial={false}
            animate={{
              opacity: showTamil ? 1 : 0,
              rotate: reduceMotion ? 0 : showTamil ? 0 : TAMIL_ROTATE_IN,
            }}
            transition={transition}
          >
            {BRAND.tamilInitial}
          </motion.span>
        </span>
      </span>

      <span aria-hidden>{REST}</span>
    </span>
  );
}
