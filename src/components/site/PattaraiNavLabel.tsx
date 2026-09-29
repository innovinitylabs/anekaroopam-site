import {
  PATTARAI_LABEL,
  PATTARAI_TAMIL,
} from "@/lib/site/pattarai-nav";
import { cn } from "@/lib/utils";

interface PattaraiNavLabelProps {
  /** Desktop progressive enhancement vs always-visible mobile form. */
  variant: "desktop" | "mobile";
  className?: string;
}

/**
 * Desktop: stacked English / Tamil. Parent must use `group/pattarai` so
 * `:hover` and `:focus-visible` on that ancestor swap opacity (SiteNav link
 * or PerceptionShell title). Never shows both at once; grid keeps layout width.
 * Mobile: Pattarai · பட்டறை for no-hover surfaces.
 * Visual spans are aria-hidden; the interactive parent supplies one accessible name.
 */
export function PattaraiNavLabel({ variant, className }: PattaraiNavLabelProps) {
  if (variant === "mobile") {
    return (
      <span
        className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}
      >
        <span className="tracking-[0.14em] uppercase">{PATTARAI_LABEL}</span>
        <span
          className="font-anek-tamil text-[1.05em] font-normal tracking-normal normal-case opacity-70"
          lang="ta"
        >
          · {PATTARAI_TAMIL}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-grid place-items-center justify-items-center",
        className,
      )}
    >
      <span
        className={cn(
          "col-start-1 row-start-1 tracking-[0.18em] uppercase transition-opacity duration-200",
          "opacity-100 group-hover/pattarai:opacity-0 group-focus-visible/pattarai:opacity-0",
        )}
        aria-hidden
      >
        {PATTARAI_LABEL}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 font-anek-tamil text-[1.15em] font-normal leading-none tracking-normal normal-case transition-opacity duration-200",
          "opacity-0 group-hover/pattarai:opacity-100 group-focus-visible/pattarai:opacity-100",
        )}
        lang="ta"
        aria-hidden
      >
        {PATTARAI_TAMIL}
      </span>
    </span>
  );
}
