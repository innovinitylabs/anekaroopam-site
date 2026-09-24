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
    const works = await listPublicArtworksFromWorker();
    const legacyIds = archiveArtworks.map((a) => a.id);
    return [...new Set([...works.map((w) => w.id), ...legacyIds])];
  }
  const fsSlugs = (await getAllArchiveEntries()).map((entry) => entry.slug);
  const legacyIds = archiveArtworks.map((a) => a.id);
  return [...new Set([...fsSlugs, ...legacyIds])];
}

export async function listAllArtworks(): Promise<PerceptionArtwork[]> {
  if (preferArchiveWorker()) {
    const works = await listPublicArtworksFromWorker();
    const workerSlugs = new Set(works.map((w) => w.id));
    return [
      ...works,
      ...archiveArtworks.filter((artwork) => !workerSlugs.has(artwork.id)),
    ];
  }
  const entries = await getAllArchiveEntries();
  const works: PerceptionArtwork[] = entries.map((entry) => ({
    ...archiveEntryToPerceptionArtwork(entry),
    imageSrc:
      buildAccessionRuntime(entry).derivatives.find((d) => d.role === "thumb")
        ?.path ?? entry.assets.thumb,
  }));
  const fsSlugs = new Set(entries.map((entry) => entry.slug));
  return [
    ...works,
    ...archiveArtworks.filter((artwork) => !fsSlugs.has(artwork.id)),
  ];
}

export {
  archiveArtworks,
  getArchiveYears,
  getArchiveProcesses,
  filterArtworks,
} from "./artworks";
