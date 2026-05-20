import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PanelSection({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6",
        className,
      )}
    >
      <header className="mb-5 border-b border-[var(--border)] pb-4">
        <h2 className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-[0.78rem] leading-relaxed text-[var(--muted)]">
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}
