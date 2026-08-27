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
import {
  archiveArtworks,
  getArtworkById as getLegacyArtworkById,
} from "./artworks";

// Filesystem archive entries are canonical. artworks.ts placeholders remain in
// the listing until a filesystem slug collides with those ids. Do not migrate
// placeholders into content/archive.

export async function getArtworkBySlug(
  slug: string,
): Promise<PerceptionArtwork | undefined> {
  const entry = await loadArchiveEntry(slug);
  if (entry) return archiveEntryToPerceptionArtwork(entry);
  return getLegacyArtworkById(slug);
}

export async function getArchiveEntryBySlug(
  slug: string,
): Promise<ArchiveEntry | null> {
  return loadArchiveEntry(slug);
}

export async function getAccessionRuntimeBySlug(
  slug: string,
): Promise<AccessionRuntime | null> {
  return hydrateAccessionRuntime(slug);
}

export async function listAllArchiveSlugs(): Promise<string[]> {
  const fsSlugs = (await getAllArchiveEntries()).map((entry) => entry.slug);
  const legacyIds = archiveArtworks.map((a) => a.id);
  return [...new Set([...fsSlugs, ...legacyIds])];
}

export async function listAllArtworks(): Promise<PerceptionArtwork[]> {
  const entries = await getAllArchiveEntries();
  const works: PerceptionArtwork[] = entries.map((entry) => ({
    ...archiveEntryToPerceptionArtwork(entry),
    imageSrc:
      buildAccessionRuntime(entry).derivatives.find((d) => d.role === "thumb")?.path ??
      entry.assets.thumb,
  }));
  const fsSlugs = new Set(entries.map((entry) => entry.slug));
  return [
    ...works,
    ...archiveArtworks.filter((artwork) => !fsSlugs.has(artwork.id)),
  ];
}

export { archiveArtworks, getArchiveYears, getArchiveProcesses, filterArtworks } from "./artworks";
