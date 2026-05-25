import fs from "fs/promises";
import path from "path";
import { getAllArchiveEntries } from "./load-entry";
import { contentArchiveDir, contentArchiveSourceDir } from "./paths";

export interface ArchiveMigrationIssue {
  slug: string;
  kind:
    | "missing-accession-id"
    | "missing-source"
    | "legacy-derivative-names";
  message: string;
}

export async function getArchiveMigrationReport(): Promise<ArchiveMigrationIssue[]> {
  const entries = await getAllArchiveEntries({ includeHidden: true });
  const issues: ArchiveMigrationIssue[] = [];

  for (const entry of entries) {
    if (!entry.accessionId && !entry.metadata.accessionId) {
      issues.push({
        slug: entry.slug,
        kind: "missing-accession-id",
        message: "Archive entry is missing permanent accession ID.",
      });
    }

    if (!entry.source?.storedFilename) {
      issues.push({
        slug: entry.slug,
        kind: "missing-source",
        message: "Archive entry needs source/master.* before regeneration.",
      });
    } else {
      try {
        await fs.access(path.join(contentArchiveSourceDir(entry.slug), entry.source.storedFilename));
      } catch {
        issues.push({
          slug: entry.slug,
          kind: "missing-source",
          message: "Archive metadata references a missing source file.",
        });
      }
    }

    try {
      await fs.access(path.join(contentArchiveDir(entry.slug), "metadata.json"));
      if (
        entry.assets.social.endsWith(".avif") ||
        entry.assets.thumb.endsWith(".avif")
      ) {
        issues.push({
          slug: entry.slug,
          kind: "legacy-derivative-names",
          message: "Archive entry uses legacy social/thumb derivative names.",
        });
      }
    } catch {
      /* handled by archive loader */
    }
  }

  return issues;
}
