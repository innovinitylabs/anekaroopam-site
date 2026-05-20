"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-[var(--border)] px-6 py-3">
        <div className="flex min-w-0 items-center gap-6 md:gap-10">
          <Link
            href="/"
            className="shrink-0 font-display text-sm tracking-[0.08em] uppercase opacity-70 transition-opacity hover:opacity-100"
          >
            Anekaroopam
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
        <p className="shrink-0 border-b border-[var(--border)] px-6 py-2 text-[0.68rem] tracking-[0.12em] text-[var(--muted)]">
          Archival conversion and export preparation
        </p>
      )}

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <CreatorCredit />
    </div>
  );
}
