"use client";

import Link from "next/link";
import { RotatingBrandMark } from "@/components/site/RotatingBrandMark";

export function PerceiveHeader() {
  return (
    <header className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-5">
      <div className="flex items-center gap-2">
        <RotatingBrandMark theme="dark" size="sm" animated priority />
        <Link
          href="/"
          className="hidden text-[0.62rem] tracking-[0.2em] uppercase text-[var(--foreground)] opacity-60 transition-opacity hover:opacity-100 sm:inline"
        >
          Anekaroopam
        </Link>
      </div>
      <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
        Perception Engine
      </p>
    </header>
  );
}
