import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-lg tracking-wide">Anekaroopam</p>
          <p className="mt-2 max-w-sm text-[0.82rem] leading-relaxed text-[var(--muted)]">
            A living perceptual archive. Artworks as unstable visual entities
            discovered through orientation.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
          <Link href="/perceive" className="hover:text-[var(--ink)]">
            Orientation System
          </Link>
          <a
            href="https://perceive.anekaroopam.art"
            className="hover:text-[var(--ink)]"
          >
            perceive.anekaroopam.art
          </a>
        </div>
      </div>
    </footer>
  );
}
