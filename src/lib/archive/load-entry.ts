import fs from "fs/promises";
import path from "path";
import {
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema";
import { contentArchiveDir } from "./paths";

const ARCHIVE_ROOT = path.join(process.cwd(), "content", "archive");

export async function listArchiveSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(ARCHIVE_ROOT, { withFileTypes: true });
    const slugs: string[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const metaPath = path.join(ARCHIVE_ROOT, ent.name, "metadata.json");
      try {
        await fs.access(metaPath);
        slugs.push(ent.name);
      } catch {
        /* skip incomplete folders */
      }
    }
    return slugs.sort();
  } catch {
    return [];
  }
}

export async function loadArchiveEntry(slug: string): Promise<ArchiveEntry | null> {
  const metaPath = path.join(contentArchiveDir(slug), "metadata.json");
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return ArchiveEntrySchema.parse(parsed);
  } catch {
    return null;
  }
}

export async function getAllArchiveEntries(): Promise<ArchiveEntry[]> {
  const slugs = await listArchiveSlugs();
  const entries: ArchiveEntry[] = [];
  for (const slug of slugs) {
    const entry = await loadArchiveEntry(slug);
    if (entry) entries.push(entry);
  }
  return entries;
}

export async function loadArchiveNotes(slug: string): Promise<string | null> {
  const notesPath = path.join(contentArchiveDir(slug), "notes.md");
  try {
    return await fs.readFile(notesPath, "utf8");
  } catch {
    return null;
  }
}
