import type { ArchiveEntry, ArchiveStatesFile } from "./schema";
import { perceptionToStatesFile } from "./adapters";

export interface ArchiveBundleFiles {
  metadataJson: string;
  statesJson: string;
  notesMd: string;
}

export function buildNotesMarkdown(entry: ArchiveEntry): string {
  const { metadata, slug } = entry;
  const lines: string[] = [
    `# ${metadata.title}`,
    "",
    `**Accession:** ${slug}`,
    "",
  ];

  if (metadata.date) lines.push(`**Date:** ${metadata.date}`);
  if (metadata.year) lines.push(`**Year:** ${metadata.year}`);
  if (metadata.process) lines.push(`**Process:** ${metadata.process}`);
  if (metadata.medium) lines.push(`**Medium:** ${metadata.medium}`);
  if (metadata.dimensions) lines.push(`**Dimensions:** ${metadata.dimensions}`);

  lines.push("");

  if (metadata.description) {
    lines.push("## Description", "", metadata.description, "");
  }

  if (metadata.perceptualNotes) {
    lines.push("## Perceptual notes", "", metadata.perceptualNotes, "");
  }

  if (metadata.rotationalObservations) {
    lines.push(
      "## Rotational observations",
      "",
      metadata.rotationalObservations,
      "",
    );
  }

  lines.push(
    "---",
    "",
    "_Canonical record: `content/archive/` — standalone HTML and public assets are derivatives._",
    "",
  );

  return lines.join("\n");
}

export function buildArchiveBundleFiles(entry: ArchiveEntry): ArchiveBundleFiles {
  const statesFile: ArchiveStatesFile = perceptionToStatesFile(
    entry.slug,
    entry.perception,
  );

  return {
    metadataJson: JSON.stringify(entry, null, 2),
    statesJson: JSON.stringify(statesFile, null, 2),
    notesMd: buildNotesMarkdown(entry),
  };
}
