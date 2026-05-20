"use client";

import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const REST = BRAND.name.slice(1);
const EASE = [0.33, 1, 0.38, 1] as const;
const DURATION = 0.4;
const HOVER_DELAY_MS = 120;

const tamilGlyphClass =
  "font-anek-tamil font-medium translate-y-[0.04em] scale-[1.1] leading-none";

type AnekaroopamWordmarkProps = {
  className?: string;
};

/**
 * Identity wordmark: leading Latin "A" shifts to Tamil "அ" (Anek Tamil) on hover.
 * Parent link should set aria-label={BRAND.name} for screen readers.
 */
export function AnekaroopamWordmark({ className }: AnekaroopamWordmarkProps) {
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTamil = hovered && !reduceMotion;

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
    duration: DURATION,
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
        className="relative inline-flex h-[1em] w-[0.92em] shrink-0 items-center justify-center"
        aria-hidden
      >
        <motion.span
          className="absolute inset-0 flex items-center justify-center will-change-[opacity,transform]"
          initial={false}
          animate={{
            opacity: showTamil ? 0 : 1,
            rotate: showTamil ? -5 : 0,
            scale: showTamil ? 0.97 : 1,
          }}
          transition={transition}
        >
          {BRAND.latinInitial}
        </motion.span>
        <motion.span
          className={cn(
            "absolute inset-0 flex items-center justify-center will-change-[opacity,transform]",
            tamilGlyphClass,
          )}
          initial={false}
          animate={{
            opacity: showTamil ? 1 : 0,
            rotate: showTamil ? 0 : 4,
            scale: showTamil ? 1 : 0.94,
          }}
          transition={transition}
        >
          {BRAND.tamilInitial}
        </motion.span>
        <span className={cn("invisible", tamilGlyphClass)} aria-hidden>
          {BRAND.tamilInitial}
        </span>
      </span>
      <span aria-hidden>{REST}</span>
    </span>
  );
}
