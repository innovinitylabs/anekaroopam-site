"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ArchiveGalleryThumb } from "@/components/site/ArchiveGalleryThumb";
import { DisplayTitle } from "@/components/site/DisplayTitle";
import { FadeIn } from "@/components/site/FadeIn";
import { hasTamilScript } from "@/lib/typography/tamil";
import type { PerceptionArtwork } from "@/lib/perception/types";
import {
  archiveSearchToQueryString,
  type ArchiveSearchParams,
} from "@/lib/archive/archive-search";
import { filterArtworks } from "@/lib/content/artworks";

export function ArchiveGrid({
  artworks,
  facets,
  initialFilters,
  serverFiltered,
  total,
}: {
  artworks: PerceptionArtwork[];
  facets: { years: number[]; processes: string[] };
  initialFilters: ArchiveSearchParams;
  serverFiltered: boolean;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [year, setYear] = useState<number | "">(
    initialFilters.year ?? "",
  );
  const [process, setProcess] = useState(initialFilters.process ?? "");
  const [query, setQuery] = useState(initialFilters.q ?? "");

  useEffect(() => {
    setYear(initialFilters.year ?? "");
    setProcess(initialFilters.process ?? "");
    setQuery(initialFilters.q ?? "");
  }, [initialFilters.year, initialFilters.process, initialFilters.q]);

  const pushFilters = useCallback(
    (next: { year: number | ""; process: string; query: string }) => {
      const params: ArchiveSearchParams = {
        q: next.query.trim() || undefined,
        year: next.year === "" ? undefined : next.year,
        process: next.process || undefined,
        sort: initialFilters.sort,
      };
      const qs = archiveSearchToQueryString(params);
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [initialFilters.sort, pathname, router],
  );

  // Keep local state in sync when the user types; debounce URL updates for q.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const currentQ = searchParams.get("q") ?? "";
      const currentYear = searchParams.get("year") ?? "";
      const currentProcess = searchParams.get("process") ?? "";
      const nextYear = year === "" ? "" : String(year);
      if (
        currentQ === (query.trim() || "") &&
        currentYear === nextYear &&
        currentProcess === process
      ) {
        return;
      }
      pushFilters({ year, process, query });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [year, process, query, pushFilters, searchParams]);

  const years = facets.years;
  const processes = facets.processes;

  const filtered = serverFiltered
    ? artworks
    : filterArtworks(
        {
          year: year === "" ? undefined : year,
          process: process || undefined,
          q: query.trim() || undefined,
        },
        artworks,
      );

  const clearFilters = () => {
    setYear("");
    setProcess("");
    setQuery("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  const hasActiveFilters = Boolean(
    query.trim() || year !== "" || process,
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
            placeholder="Title, accession, or slug"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            className="self-end text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)] underline-offset-4 hover:underline"
            onClick={clearFilters}
          >
            Clear
          </button>
        )}
      </FadeIn>

      <p
        className={`mt-4 text-[0.68rem] tracking-[0.12em] uppercase text-[var(--muted)] ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {filtered.length === 0
          ? "No matching records"
          : `${filtered.length}${serverFiltered && total > filtered.length ? ` of ${total}` : ""} record${filtered.length === 1 ? "" : "s"}`}
      </p>

      <ul className="mt-12 grid gap-14 sm:grid-cols-2 md:mt-16 md:gap-12 lg:grid-cols-3">
        {filtered.map((artwork, i) => (
          <FadeIn key={artwork.id} delay={0.05 * i}>
            <li>
              <Link href={`/archive/${artwork.id}`} className="group block">
                <div className="archive-mount relative aspect-square overflow-hidden">
                  <ArchiveGalleryThumb
                    src={artwork.imageSrc}
                    alt={artwork.metadata.title}
                    priority={i === 0}
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
