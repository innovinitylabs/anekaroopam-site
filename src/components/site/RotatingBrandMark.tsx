"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { brandMarkSrc, type BrandTheme } from "@/lib/brand";
import { cn } from "@/lib/utils";

const markHeights = {
  sm: 28,
  md: 36,
  lg: 52,
  xl: 96,
} as const;

function randomAngle(): number {
  return Math.floor(Math.random() * 360);
}

function nextAngle(current: number): number {
  const steps = [37, 53, 71, 89, 127, 143, 167, 193, 211, 239, 271, 311];
  const delta = steps[Math.floor(Math.random() * steps.length)];
  const direction = Math.random() > 0.5 ? 1 : -1;
  let next = (current + delta * direction) % 360;
  if (next < 0) next += 360;
  if (Math.abs(next - current) < 12) next = (next + 83) % 360;
  return next;
}

type RotatingBrandMarkProps = {
  theme?: BrandTheme;
  size?: keyof typeof markHeights;
  animated?: boolean;
  className?: string;
  priority?: boolean;
};

export function RotatingBrandMark({
  theme = "light",
  size = "md",
  animated = false,
  className,
  priority = false,
}: RotatingBrandMarkProps) {
  const [angle, setAngle] = useState(randomAngle);
  const height = markHeights[size];
  const width = Math.round(height * 1.05);
  const src = brandMarkSrc(theme, { animated });
  const isGif = src.endsWith(".gif");

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAngle((current) => nextAngle(current));
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2",
        className,
      )}
      aria-label="Rotate mark"
    >
      <motion.span
        className="inline-block"
        animate={{ rotate: angle }}
        transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "center center" }}
      >
        <Image
          src={src}
          alt=""
          width={width}
          height={height}
          priority={priority}
          unoptimized={isGif}
          className="pointer-events-none object-contain"
          style={{ width, height }}
        />
      </motion.span>
    </button>
  );
}
