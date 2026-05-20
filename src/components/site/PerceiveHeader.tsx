"use client";

import Link from "next/link";
import { RotatingBrandMark } from "@/components/site/RotatingBrandMark";

export function PerceiveHeader() {
  return (
    <header className="z-50 flex w-full shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
      <div className="flex items-center gap-2">
        <RotatingBrandMark theme="dark" size="sm" animated priority />
        <div className="hidden items-center gap-4 sm:flex">
          <Link
            href="/perceive/tools/prepare"
            className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--foreground)] opacity-40 transition-opacity hover:opacity-90"
          >
            Prepare
          </Link>
          <Link
            href="/"
            className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--foreground)] opacity-60 transition-opacity hover:opacity-100"
          >
            Anekaroopam
          </Link>
        </div>
      </div>
      <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
        Perception Engine
      </p>
    </header>
  );
}
