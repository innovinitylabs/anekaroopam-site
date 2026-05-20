import type { Metadata } from "next";
import Link from "next/link";

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
          className="text-[0.62rem] tracking-[0.2em] uppercase text-[#e8e4dc] opacity-60 hover:opacity-100"
        >
          Anekaroopam
        </Link>
        <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[#e8e4dc] opacity-40">
          Perception Engine
        </p>
      </header>
      {children}
    </div>
  );
}
