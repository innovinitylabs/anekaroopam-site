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
import {
  isCuratedSlug,
  isCuratedVisible,
  loadCuratedVisibility,
  visibleCuratedArtworks,
} from "@/lib/archive/curated";
import { isPublicArchiveEntry } from "@/lib/archive/visibility";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  tryGetPublicArtworkFromWorker,
  tryGetPublicEntryFromWorker,
  tryListPublicArtworksFromWorker,
} from "@/lib/archive/worker-public";
import {
  archiveArtworks,
  getArtworkById as getLegacyArtworkById,
} from "./artworks";

// When ARCHIVE_WORKER_* is configured, Worker public API is canonical.
// Fallback to FS only on Worker infrastructure failure (never on 404).
// Curated repository works are resolved separately and shown only when their
// stored visibility is known and visible (see @/lib/archive/curated).

export type ArtworkResolveResult = {
  artwork: PerceptionArtwork | undefined;
  fallbackActive: boolean;
  fallbackReason?: string;
};

function logFallback(slug: string, reason: string) {
  console.warn(
    JSON.stringify({
      event: "archive_fallback_active",
      slug,
      reason,
    }),
  );
}

/** Hidden and withdrawn local copies are never eligible for outage fallback. */
async function loadPublicFallbackEntry(
  slug: string,
): Promise<ArchiveEntry | null> {
  const entry = await loadArchiveEntry(slug);
  return entry && isPublicArchiveEntry(entry) ? entry : null;
}

async function resolveDetailFallback(
  slug: string,
  reason: string,
): Promise<ArtworkResolveResult> {
  logFallback(slug, reason);
  const entry = await loadArchiveEntry(slug);
  if (entry) {
    // A non-public local record must not fall through to a same-slug placeholder.
    if (!isPublicArchiveEntry(entry)) {
      return { artwork: undefined, fallbackActive: false };
    }
    return {
      artwork: archiveEntryToPerceptionArtwork(entry),
      fallbackActive: true,
      fallbackReason: reason,
    };
  }
  return { artwork: undefined, fallbackActive: false };
}

async function resolveCuratedDetail(
  slug: string,
): Promise<ArtworkResolveResult> {
  const visibility = await loadCuratedVisibility();
  return {
    artwork: isCuratedVisible(visibility, slug)
      ? getLegacyArtworkById(slug)
      : undefined,
    fallbackActive: false,
  };
}

export async function getArtworkBySlug(
  slug: string,
): Promise<PerceptionArtwork | undefined> {
  const result = await getArtworkBySlugDetailed(slug);
  return result.artwork;
}

export async function getArtworkBySlugDetailed(
  slug: string,
): Promise<ArtworkResolveResult> {
  if (preferArchiveWorker()) {
    if (isCuratedSlug(slug)) return resolveCuratedDetail(slug);
    const fromWorker = await tryGetPublicArtworkFromWorker(slug);
    if (fromWorker.ok) {
      return { artwork: fromWorker.value ?? undefined, fallbackActive: false };
    }
    return resolveDetailFallback(
      slug,
      fromWorker.reason ?? "worker unavailable",
    );
  }
  const entry = await loadArchiveEntry(slug);
  if (entry) {
    return {
      artwork: archiveEntryToPerceptionArtwork(entry),
      fallbackActive: false,
    };
  }
  return {
    artwork: getLegacyArtworkById(slug),
    fallbackActive: false,
  };
}

export async function getArchiveEntryBySlug(
  slug: string,
): Promise<ArchiveEntry | null> {
  if (preferArchiveWorker()) {
    if (isCuratedSlug(slug)) return null;
    const result = await tryGetPublicEntryFromWorker(slug);
    if (result.ok) return result.value;
    logFallback(slug, result.reason ?? "worker unavailable");
    return loadPublicFallbackEntry(slug);
  }
  return loadArchiveEntry(slug);
}

export async function getAccessionRuntimeBySlug(
  slug: string,
): Promise<AccessionRuntime | null> {
  if (preferArchiveWorker()) {
    if (isCuratedSlug(slug)) return null;
    const result = await tryGetPublicEntryFromWorker(slug);
    if (result.ok) {
      if (!result.value) return null;
      return buildAccessionRuntime(result.value);
    }
    logFallback(slug, result.reason ?? "worker unavailable");
    const entry = await loadPublicFallbackEntry(slug);
    return entry ? buildAccessionRuntime(entry) : null;
  }
  return hydrateAccessionRuntime(slug);
}

export async function listAllArchiveSlugs(): Promise<string[]> {
  if (preferArchiveWorker()) {
    const [listed, curated] = await Promise.all([
      tryListPublicArtworksFromWorker({ limit: 200 }),
      loadCuratedVisibility(),
    ]);
    if (listed.ok) {
      return [
        ...listed.value.artworks
          .map((w) => w.id)
          .filter((slug) => !isCuratedSlug(slug)),
        ...visibleCuratedArtworks(curated).map((a) => a.id),
      ];
    }
    console.warn(
      JSON.stringify({
        event: "archive_list_worker_unavailable",
        reason: listed.reason,
      }),
    );
    return [];
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
  fallbackActive?: boolean;
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
    const [facetSource, curatedVisibility] = await Promise.all([
      tryListPublicArtworksFromWorker({ limit: 200 }),
      loadCuratedVisibility(),
    ]);
    if (!facetSource.ok) {
      console.warn(
        JSON.stringify({
          event: "archive_list_worker_unavailable",
          reason: facetSource.reason,
        }),
      );
      return {
        artworks: [],
        total: 0,
        facets: { years: [], processes: [] },
        serverFiltered: true,
        fallbackActive: true,
      };
    }
    const curated = visibleCuratedArtworks(curatedVisibility);
    const withoutCurated = (works: PerceptionArtwork[]) =>
      works.filter((w) => !isCuratedSlug(w.id));
    // Curated works are appended to the first page only.
    const curatedPage = filters.offset
      ? []
      : curated.filter((a) => matchesArchiveSearch(a, filters));
    const facets = deriveFacets([
      ...withoutCurated(facetSource.value.artworks),
      ...curated,
    ]);
    const hasFilters = Boolean(
      filters.q?.trim() ||
        filters.year != null ||
        filters.process?.trim(),
    );
    if (!hasFilters && !filters.offset) {
      const works = withoutCurated(facetSource.value.artworks);
      return {
        artworks: [...works, ...curatedPage],
        total:
          facetSource.value.total -
          (facetSource.value.artworks.length - works.length) +
          curated.length,
        facets,
        serverFiltered: true,
      };
    }
    const filtered = await tryListPublicArtworksFromWorker(filters);
    if (!filtered.ok) {
      return {
        artworks: [],
        total: 0,
        facets,
        serverFiltered: true,
        fallbackActive: true,
      };
    }
    const works = withoutCurated(filtered.value.artworks);
    const curatedMatches = curated.filter((a) =>
      matchesArchiveSearch(a, filters),
    );
    return {
      artworks: [...works, ...curatedPage],
      total:
        filtered.value.total -
        (filtered.value.artworks.length - works.length) +
        curatedMatches.length,
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
