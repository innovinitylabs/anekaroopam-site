import Link from "next/link";
import { BrandLogo } from "@/components/site/BrandLogo";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <BrandLogo href="/" size="sm" showWordmark />
          <p className="mt-4 max-w-sm text-[0.82rem] leading-relaxed text-[var(--muted)]">
            A living perceptual archive. Artworks as unstable visual entities
            discovered through orientation.
          </p>
        </div>
        <a
          href="https://valipokkann.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)] transition-opacity hover:opacity-80"
        >
          Valipokkann
        </a>
      </div>
    </footer>
  );
}
