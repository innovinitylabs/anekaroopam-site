import {
  PATTARAI_LABEL,
  PATTARAI_MOBILE_LABEL,
  PATTARAI_TAMIL,
} from "@/lib/site/pattarai-nav";
import { cn } from "@/lib/utils";

interface PattaraiNavLabelProps {
  /** Desktop progressive enhancement vs always-visible mobile form. */
  variant: "desktop" | "mobile";
  className?: string;
}

/**
 * Default: Pattarai. Desktop hover/focus reveals பட்டறை.
 * Mobile shows Pattarai · பட்டறை (no hover).
 */
export function PattaraiNavLabel({ variant, className }: PattaraiNavLabelProps) {
  if (variant === "mobile") {
    return (
      <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
        <span className="tracking-[0.14em] uppercase">{PATTARAI_LABEL}</span>
        <span className="font-normal tracking-normal normal-case opacity-70" lang="ta">
          · {PATTARAI_TAMIL}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "group/pattarai relative inline-grid place-items-center",
        className,
      )}
    >
      <span
        className="col-start-1 row-start-1 tracking-[0.18em] uppercase transition-opacity duration-200 group-hover/pattarai:opacity-0 group-focus-within/pattarai:opacity-0"
        aria-hidden
      >
        {PATTARAI_LABEL}
      </span>
      <span
        className="col-start-1 row-start-1 font-normal tracking-normal normal-case opacity-0 transition-opacity duration-200 group-hover/pattarai:opacity-100 group-focus-within/pattarai:opacity-100"
        lang="ta"
        aria-hidden
      >
        {PATTARAI_TAMIL}
      </span>
      {/* Screen readers get aria-label on the parent link; keep a stable accessible text fallback */}
      <span className="sr-only">{PATTARAI_MOBILE_LABEL}</span>
    </span>
  );
}
