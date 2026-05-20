"use client";

import Link from "next/link";
import { AnekaroopamWordmark } from "@/components/site/AnekaroopamWordmark";
import { RotatingBrandMark } from "@/components/site/RotatingBrandMark";
import { BRAND, type BrandTheme } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  theme?: BrandTheme;
  animated?: boolean;
  className?: string;
  wordmarkClassName?: string;
  priority?: boolean;
};

export function BrandLogo({
  href = "/",
  showWordmark = true,
  size = "md",
  theme = "light",
  animated = false,
  className,
  wordmarkClassName,
  priority = false,
}: BrandLogoProps) {
  const wrapperClass = cn("inline-flex items-center gap-2.5", className);

  return (
    <div className={wrapperClass}>
      <RotatingBrandMark
        theme={theme}
        size={size}
        animated={animated}
        priority={priority}
      />
      {showWordmark &&
        (href ? (
          <Link
            href={href}
            aria-label={BRAND.name}
            className={cn(
              "font-display tracking-[0.12em] uppercase transition-opacity hover:opacity-85",
              size === "sm" && "text-sm",
              size === "md" && "text-lg",
              size === "lg" && "text-2xl",
              size === "xl" && "text-2xl",
              wordmarkClassName,
            )}
          >
            <AnekaroopamWordmark />
          </Link>
        ) : (
          <span
            aria-label={BRAND.name}
            className={cn(
              "font-display tracking-[0.12em] uppercase",
              size === "sm" && "text-sm",
              size === "md" && "text-lg",
              size === "lg" && "text-2xl",
              size === "xl" && "text-2xl",
              wordmarkClassName,
            )}
          >
            <AnekaroopamWordmark />
          </span>
        ))}
    </div>
  );
}
