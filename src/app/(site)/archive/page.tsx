"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { DisplayTitle } from "@/components/site/DisplayTitle";
import { FadeIn } from "@/components/site/FadeIn";
import { hasTamilScript } from "@/lib/typography/tamil";
import {
  archiveArtworks,
  filterArtworks,
  getArchiveProcesses,
  getArchiveYears,
} from "@/lib/content/artworks";

export default function ArchivePage() {
  const [year, setYear] = useState<number | "">("");
  const [process, setProcess] = useState("");
  const [query, setQuery] = useState("");

  const years = getArchiveYears();
  const processes = getArchiveProcesses();

  const filtered = useMemo(() => {
    const base = filterArtworks({
      year: year === "" ? undefined : year,
      process: process || undefined,
      state: query || undefined,
    });
    if (!query) return base;
    return base.filter(
      (a) =>
        a.metadata.title.toLowerCase().includes(query.toLowerCase()) ||
        a.states.some((s) =>
          s.name.toLowerCase().includes(query.toLowerCase()),
        ),
    );
  }, [year, process, query]);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 md:px-10">
      <FadeIn>
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          Archive
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">
          Perceptual records
        </h1>
        <p className="mt-6 max-w-xl text-[var(--muted)] leading-relaxed">
          Minimal metadata. Each entry opens into the orientation interface where
          states await discovery.
        </p>
      </FadeIn>

      <FadeIn delay={0.1} className="mt-12 flex flex-wrap gap-6 border-y border-[var(--border)] py-6">
        <label className="text-[0.62rem] tracking-[0.16em] uppercase">
          Year
          <select
            className="mt-1 block border-b border-[var(--border)] bg-transparent py-1 text-sm normal-case tracking-normal"
            value={year}
            onChange={(e) =>
              setYear(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[0.62rem] tracking-[0.16em] uppercase">
          Process
          <select
            className="mt-1 block border-b border-[var(--border)] bg-transparent py-1 text-sm normal-case tracking-normal"
            value={process}
            onChange={(e) => setProcess(e.target.value)}
          >
            <option value="">All</option>
            {processes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 min-w-[12rem] text-[0.62rem] tracking-[0.16em] uppercase">
          Search
          <input
            className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-1 text-sm normal-case tracking-normal outline-none"
            placeholder="Title or perceptual state"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </FadeIn>

      <ul className="mt-16 grid gap-12 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((artwork, i) => (
          <FadeIn key={artwork.id} delay={0.05 * i}>
            <li>
              <Link href={`/archive/${artwork.id}`} className="group block">
                <div className="archive-mount relative aspect-square overflow-hidden">
                  <Image
                    src={artwork.imageSrc}
                    alt={artwork.metadata.title}
                    fill
                    className="relative z-[1] object-contain p-6"
                  />
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <h2
                    className={
                      hasTamilScript(artwork.metadata.title)
                        ? "text-xl font-anek-tamil-thin tracking-[0.06em] normal-case"
                        : "font-display text-xl tracking-wide"
                    }
                  >
                    <DisplayTitle>{artwork.metadata.title}</DisplayTitle>
                  </h2>
                  {artwork.metadata.year && (
                    <span className="text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                      {artwork.metadata.year}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                  {artwork.metadata.process}
                  {artwork.states.length > 0 &&
                    ` · ${artwork.states.length} states`}
                </p>
              </Link>
            </li>
          </FadeIn>
        ))}
      </ul>
    </div>
  );
}
