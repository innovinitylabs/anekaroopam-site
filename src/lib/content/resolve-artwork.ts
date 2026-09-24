import type { PerceptionArtwork } from "@/lib/perception/types";
import type { ArchiveEntry } from "@/lib/archive/schema";
import { archiveEntryToPerceptionArtwork } from "@/lib/archive/adapters";
import {
  getAllArchiveEntries,
  loadArchiveEntry,
} from "@/lib/archive/load-entry";
import {
  buildAccessionRuntime,
  hydrateAccessionRuntime,
  type AccessionRuntime,
} from "@/lib/archive/runtime";
import type { ArchiveSearchParams } from "@/lib/archive/archive-search";
import { matchesArchiveSearch } from "@/lib/archive/archive-search";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  getPublicArtworkFromWorker,
  getPublicEntryFromWorker,
  listPublicArtworksFromWorker,
} from "@/lib/archive/worker-public";
import {
  archiveArtworks,
  getArtworkById as getLegacyArtworkById,
} from "./artworks";

// When ARCHIVE_WORKER_* is configured, Worker public API is canonical.
// Otherwise filesystem archive entries are canonical; artworks.ts placeholders
// remain until a filesystem slug collides.

export async function getArtworkBySlug(
  slug: string,
): Promise<PerceptionArtwork | undefined> {
  if (preferArchiveWorker()) {
    const fromWorker = await getPublicArtworkFromWorker(slug);
    if (fromWorker) return fromWorker;
    return getLegacyArtworkById(slug);
  }
  const entry = await loadArchiveEntry(slug);
  if (entry) return archiveEntryToPerceptionArtwork(entry);
  return getLegacyArtworkById(slug);
}

export async function getArchiveEntryBySlug(
  slug: string,
): Promise<ArchiveEntry | null> {
  if (preferArchiveWorker()) {
    return getPublicEntryFromWorker(slug);
  }
  return loadArchiveEntry(slug);
}

export async function getAccessionRuntimeBySlug(
  slug: string,
): Promise<AccessionRuntime | null> {
  if (preferArchiveWorker()) {
    const entry = await getPublicEntryFromWorker(slug);
    if (!entry) return null;
    return buildAccessionRuntime(entry);
  }
  return hydrateAccessionRuntime(slug);
}

export async function listAllArchiveSlugs(): Promise<string[]> {
  if (preferArchiveWorker()) {
    const { artworks: works } = await listPublicArtworksFromWorker({
      limit: 200,
    });
    const legacyIds = archiveArtworks.map((a) => a.id);
    return [...new Set([...works.map((w) => w.id), ...legacyIds])];
  }
  const fsSlugs = (await getAllArchiveEntries()).map((entry) => entry.slug);
  const legacyIds = archiveArtworks.map((a) => a.id);
  return [...new Set([...fsSlugs, ...legacyIds])];
}

export type ArchiveListResult = {
  artworks: PerceptionArtwork[];
  total: number;
  facets: { years: number[]; processes: string[] };
  serverFiltered: boolean;
};

function deriveFacets(artworks: PerceptionArtwork[]) {
  const years = Array.from(
    new Set(
      artworks
        .map((a) => a.metadata.year)
        .filter((y): y is number => typeof y === "number"),
    ),
  ).sort((a, b) => b - a);
  const processes = Array.from(
    new Set(
      artworks
        .map((a) => a.metadata.process)
        .filter((p): p is string => Boolean(p)),
    ),
  ).sort();
  return { years, processes };
}

export async function listAllArtworks(
  filters: ArchiveSearchParams = {},
): Promise<ArchiveListResult> {
  if (preferArchiveWorker()) {
    const facetSource = await listPublicArtworksFromWorker({ limit: 200 });
    const facets = deriveFacets(facetSource.artworks);
    const hasFilters = Boolean(
      filters.q?.trim() ||
        filters.year != null ||
        filters.process?.trim(),
    );
    if (!hasFilters && !filters.offset) {
      const legacy = archiveArtworks.filter(
        (a) => !new Set(facetSource.artworks.map((w) => w.id)).has(a.id),
      );
      const merged = [...facetSource.artworks, ...legacy];
      return {
        artworks: merged,
        total: facetSource.total + legacy.length,
        facets: deriveFacets(merged),
        serverFiltered: true,
      };
    }
    const filtered = await listPublicArtworksFromWorker(filters);
    return {
      artworks: filtered.artworks,
      total: filtered.total,
      facets,
      serverFiltered: true,
    };
  }

  const entries = await getAllArchiveEntries();
  const works: PerceptionArtwork[] = entries.map((entry) => ({
    ...archiveEntryToPerceptionArtwork(entry),
    imageSrc:
      buildAccessionRuntime(entry).derivatives.find((d) => d.role === "thumb")
        ?.path ?? entry.assets.thumb,
  }));
  const fsSlugs = new Set(entries.map((entry) => entry.slug));
  const all = [
    ...works,
    ...archiveArtworks.filter((artwork) => !fsSlugs.has(artwork.id)),
  ];
  const facets = deriveFacets(all);
  const filtered = all.filter((a) => matchesArchiveSearch(a, filters));
  return {
    artworks: filtered,
    total: filtered.length,
    facets,
    serverFiltered: false,
  };
}

export {
  archiveArtworks,
  getArchiveYears,
  getArchiveProcesses,
  filterArtworks,
} from "./artworks";
