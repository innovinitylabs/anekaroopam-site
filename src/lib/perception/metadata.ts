import type { ArtworkMetadata } from "./types";

export const DEFAULT_ARTIST_WEBSITE = "https://valipokkann.in";

export function createDefaultMetadata(
  partial?: Partial<ArtworkMetadata>,
): ArtworkMetadata {
  return {
    title: "",
    artistWebsite: DEFAULT_ARTIST_WEBSITE,
    ...partial,
  };
}

export function mergeArtworkMetadata(
  metadata: Partial<ArtworkMetadata> | undefined,
): ArtworkMetadata {
  return createDefaultMetadata({
    ...metadata,
    title: metadata?.title ?? "",
    artistWebsite:
      metadata?.artistWebsite?.trim() || DEFAULT_ARTIST_WEBSITE,
  });
}

export interface MetadataEntry {
  label: string;
  value: string;
}

const ADVANCED_FIELD_MAP: { key: keyof ArtworkMetadata; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "medium", label: "Medium" },
  { key: "dimensions", label: "Dimensions" },
  { key: "edition", label: "Edition" },
  { key: "collection", label: "Collection" },
  { key: "postProcessing", label: "Post-processing" },
  { key: "captureMethod", label: "Capture method" },
  { key: "orientationNotes", label: "Orientation notes" },
  { key: "artistWebsite", label: "Artist website" },
  { key: "archivalLink", label: "Archival link" },
  { key: "transientLink", label: "Transient link" },
  { key: "discoveredForms", label: "Discovered forms" },
  { key: "perceptualNotes", label: "Perceptual notes" },
  { key: "rotationalObservations", label: "Rotational observations" },
];

export function advancedMetadataEntries(
  metadata: ArtworkMetadata,
): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  for (const { key, label } of ADVANCED_FIELD_MAP) {
    const raw = metadata[key];
    if (typeof raw === "string" && raw.trim()) {
      entries.push({ label, value: raw.trim() });
    }
  }
  return entries;
}

export function hasAdvancedMetadata(metadata: ArtworkMetadata): boolean {
  return advancedMetadataEntries(metadata).length > 0;
}

export function primaryOverlayDetails(
  metadata: ArtworkMetadata,
  fields?: { year?: boolean; process?: boolean; medium?: boolean },
): string[] {
  const parts: string[] = [];
  if (fields?.year !== false && metadata.year) {
    parts.push(String(metadata.year));
  }
  if (fields?.year !== false && metadata.date?.trim()) {
    const formatted = formatDisplayDate(metadata.date);
    if (formatted && !parts.includes(formatted)) parts.push(formatted);
  }
  if (fields?.process !== false && metadata.process?.trim()) {
    parts.push(metadata.process.trim());
  }
  if (fields?.medium !== false && metadata.medium?.trim()) {
    parts.push(metadata.medium.trim());
  }
  return parts;
}

function formatDisplayDate(iso: string): string | null {
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  try {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(parsed));
  } catch {
    return trimmed;
  }
}
