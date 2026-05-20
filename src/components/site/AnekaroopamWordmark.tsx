"use client";

import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const REST = BRAND.name.slice(1);
const EASE = [0.33, 1, 0.38, 1] as const;
const DURATION = 0.42;
const HOVER_DELAY_MS = 120;

/** Optical tuning for Tamil only — Latin A has no transform. */
const tamilGlyphClass =
  "font-anek-tamil font-medium leading-none pr-[0.06em] -translate-y-[0.04em] scale-[1.08]";

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

  const fade = {
    duration: reduceMotion ? 0 : DURATION,
    ease: EASE,
  };

  return (
    <span
      className={cn("inline-flex items-baseline leading-none", className)}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span className="wordmark-initial relative inline-block shrink-0 align-baseline leading-none">
        <span
          className={cn("invisible inline-block", tamilGlyphClass)}
          aria-hidden
        >
          {BRAND.tamilInitial}
        </span>

        <motion.span
          className="latin-a absolute bottom-0 left-0 leading-none"
          aria-hidden
          initial={false}
          animate={{ opacity: showTamil ? 0 : 1 }}
          transition={fade}
        >
          {BRAND.latinInitial}
        </motion.span>

        <motion.span
          className={cn(
            "tamil-a absolute bottom-0 left-0 leading-none will-change-[opacity]",
            tamilGlyphClass,
          )}
          aria-hidden
          initial={false}
          animate={{ opacity: showTamil ? 1 : 0 }}
          transition={fade}
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
