"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { DisplayTitle } from "@/components/site/DisplayTitle";
import { FadeIn } from "@/components/site/FadeIn";
import { hasTamilScript } from "@/lib/typography/tamil";
import type { PerceptionArtwork } from "@/lib/perception/types";
import {
  filterArtworks,
} from "@/lib/content/artworks";

export function ArchiveGrid({
  artworks,
}: {
  artworks: PerceptionArtwork[];
}) {
  const [year, setYear] = useState<number | "">("");
  const [process, setProcess] = useState("");
  const [query, setQuery] = useState("");

  const years = Array.from(
    new Set(
      artworks
        .map((artwork) => artwork.metadata.year)
        .filter((value): value is number => typeof value === "number"),
    ),
  ).sort((a, b) => Number(b) - Number(a));
  const processes = Array.from(
    new Set(
      artworks
        .map((artwork) => artwork.metadata.process)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  const base = filterArtworks(
    {
      year: year === "" ? undefined : year,
      process: process || undefined,
      state: query || undefined,
    },
    artworks,
  );
  const filtered = !query
    ? base
    : base.filter(
        (a) =>
          a.metadata.title.toLowerCase().includes(query.toLowerCase()) ||
          a.states.some((s) =>
            s.name.toLowerCase().includes(query.toLowerCase()),
          ),
      );

  return (
    <>
      <FadeIn delay={0.1} className="mt-10 grid gap-5 border-y border-[var(--border)] py-6 sm:grid-cols-2 md:mt-12 md:flex md:flex-wrap md:gap-6">
        <label className="text-[0.62rem] tracking-[0.16em] uppercase">
          Year
          <select
            className="mt-1 block min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 text-sm normal-case tracking-normal md:w-auto"
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
            className="mt-1 block min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 text-sm normal-case tracking-normal md:w-auto"
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
        <label className="min-w-0 text-[0.62rem] tracking-[0.16em] uppercase sm:col-span-2 md:min-w-[12rem] md:flex-1">
          Search
          <input
            className="mt-1 min-h-10 w-full border-b border-[var(--border)] bg-transparent py-1 text-sm normal-case tracking-normal outline-none"
            placeholder="Title or perceptual state"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </FadeIn>

      <ul className="mt-12 grid gap-14 sm:grid-cols-2 md:mt-16 md:gap-12 lg:grid-cols-3">
        {filtered.map((artwork, i) => (
          <FadeIn key={artwork.id} delay={0.05 * i}>
            <li>
              <Link href={`/archive/${artwork.id}`} className="group block">
                <div className="archive-mount relative aspect-square overflow-hidden">
                  <Image
                    src={artwork.imageSrc}
                    alt={artwork.metadata.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    priority={i === 0}
                    className="relative z-[1] object-contain p-5 sm:p-6"
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
    </>
  );
}
