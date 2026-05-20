"use client";

import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const REST = BRAND.name.slice(1);
const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.42;

type AnekaroopamWordmarkProps = {
  className?: string;
};

/**
 * Identity wordmark: leading Latin "A" shifts to Tamil "அ" on hover.
 * Parent link should set aria-label={BRAND.name} for screen readers.
 */
export function AnekaroopamWordmark({ className }: AnekaroopamWordmarkProps) {
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();

  const showTamil = hovered && !reduceMotion;

  return (
    <span
      className={cn("inline-flex items-baseline", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span
        className="relative inline-flex h-[1em] w-[0.78em] shrink-0 items-center justify-center"
        aria-hidden
      >
        <motion.span
          className="absolute inset-0 flex items-center justify-center will-change-transform"
          initial={false}
          animate={{
            opacity: showTamil ? 0 : 1,
            rotate: showTamil ? -14 : 0,
            scale: showTamil ? 0.92 : 1,
          }}
          transition={{ duration: DURATION, ease: EASE }}
        >
          {BRAND.latinInitial}
        </motion.span>
        <motion.span
          className="absolute inset-0 flex items-center justify-center will-change-transform"
          initial={false}
          animate={{
            opacity: showTamil ? 1 : 0,
            rotate: showTamil ? 0 : 12,
            scale: showTamil ? 1 : 0.92,
          }}
          transition={{ duration: DURATION, ease: EASE }}
        >
          {BRAND.tamilInitial}
        </motion.span>
        <span className="invisible" aria-hidden>
          {BRAND.latinInitial}
        </span>
      </span>
      <span aria-hidden>{REST}</span>
    </span>
  );
}
