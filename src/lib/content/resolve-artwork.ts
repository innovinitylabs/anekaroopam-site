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
// Fallback to FS/legacy only on Worker infrastructure failure (never on 404).

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
  const legacy = getLegacyArtworkById(slug);
  return {
    artwork: legacy,
    fallbackActive: Boolean(legacy),
    fallbackReason: legacy ? reason : undefined,
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
    const listed = await tryListPublicArtworksFromWorker({ limit: 200 });
    if (listed.ok) {
      return listed.value.artworks.map((w) => w.id);
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
    const facetSource = await tryListPublicArtworksFromWorker({ limit: 200 });
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
    const facets = deriveFacets(facetSource.value.artworks);
    const hasFilters = Boolean(
      filters.q?.trim() ||
        filters.year != null ||
        filters.process?.trim(),
    );
    if (!hasFilters && !filters.offset) {
      return {
        artworks: facetSource.value.artworks,
        total: facetSource.value.total,
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
    return {
      artworks: filtered.value.artworks,
      total: filtered.value.total,
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
