"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnekaroopamWordmark } from "@/components/site/AnekaroopamWordmark";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { PerceptionSubnav } from "./PerceptionSubnav";
import { CreatorCredit } from "./CreatorCredit";

const siteLinks = [
  { href: "/archive", label: "Archive" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/about", label: "About" },
];

export function PerceptionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onPrepare = pathname.startsWith("/perceive/tools");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 sm:px-6 md:gap-6">
        <div className="flex min-w-0 items-center gap-4 md:gap-10">
          <Link
            href="/"
            aria-label={BRAND.name}
            className="min-w-0 shrink font-display text-xs tracking-[0.06em] uppercase opacity-70 transition-opacity hover:opacity-100 sm:text-sm sm:tracking-[0.08em]"
          >
            <AnekaroopamWordmark />
          </Link>
          <span className="hidden h-3 w-px bg-[var(--border)] sm:block" aria-hidden />
          <PerceptionSubnav />
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          {siteLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)] transition-opacity hover:opacity-90"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      {onPrepare && (
        <p className="shrink-0 border-b border-[var(--border)] px-4 py-2 text-[0.64rem] leading-relaxed tracking-[0.1em] text-[var(--muted)] sm:px-6 sm:text-[0.68rem] sm:tracking-[0.12em]">
          Archival conversion and export preparation
        </p>
      )}

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <CreatorCredit />
    </div>
  );
}
