import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Orientation System",
  description:
    "Perception Engine and configurational interface for multistable artworks.",
};

export default function PerceiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="perceive-theme min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]">
      <header className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-5 mix-blend-difference">
        <Link
          href="/"
          className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100"
          aria-label="Anekaroopam home"
        >
          <Image
            src={BRAND.mark}
            alt=""
            width={32}
            height={28}
            className="h-7 w-auto object-contain"
          />
          <span className="hidden text-[0.62rem] tracking-[0.2em] uppercase text-[#e8e4dc] sm:inline">
            Anekaroopam
          </span>
        </Link>
        <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[#e8e4dc] opacity-40">
          Perception Engine
        </p>
      </header>
      {children}
    </div>
  );
}
