import type { PerceptionArtwork } from "@/lib/perception/types";
import type { ArchiveEntry } from "@/lib/archive/schema";
import { archiveEntryToPerceptionArtwork } from "@/lib/archive/adapters";
import { loadArchiveEntry, listArchiveSlugs } from "@/lib/archive/load-entry";
import {
  archiveArtworks,
  getArtworkById as getLegacyArtworkById,
} from "./artworks";

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

export async function listAllArchiveSlugs(): Promise<string[]> {
  const fsSlugs = await listArchiveSlugs();
  const legacyIds = archiveArtworks.map((a) => a.id);
  return [...new Set([...fsSlugs, ...legacyIds])];
}

export async function listAllArtworks(): Promise<PerceptionArtwork[]> {
  const slugs = await listAllArchiveSlugs();
  const works: PerceptionArtwork[] = [];
  for (const slug of slugs) {
    const w = await getArtworkBySlug(slug);
    if (w) works.push(w);
  }
  return works;
}

export { archiveArtworks, getArchiveYears, getArchiveProcesses, filterArtworks } from "./artworks";
