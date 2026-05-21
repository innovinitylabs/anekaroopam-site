import type { ExportPayload, PerceptionArtwork } from "@/lib/perception/types";
import {
  ARCHIVE_VERSION,
  AccessionDraftSchema,
  type ArchiveAssets,
  type ArchiveDraft,
  type ArchiveEntry,
  type ArchivePerception,
  type AccessionDraft,
  type ProvenanceRecord,
  defaultArchiveAssets,
  emptyProvenance,
} from "./schema";

export function perceptionArtworkToArchiveEntry(
  artwork: PerceptionArtwork,
  slug: string,
  assets?: ArchiveAssets,
  provenance?: ProvenanceRecord,
  accessionId?: string,
): ArchiveEntry {
  const now = new Date().toISOString();
  const resolvedAssets = assets ?? defaultArchiveAssets(slug);
  const resolvedAccessionId = accessionId ?? artwork.metadata.accessionId;

  return {
    version: ARCHIVE_VERSION,
    accessionId: resolvedAccessionId,
    slug,
    status: "published",
    metadata: {
      ...artwork.metadata,
      accessionId: resolvedAccessionId,
    },
    assets: resolvedAssets,
    perception: {
      states: artwork.states,
      background: artwork.background,
      initialAngle: artwork.initialAngle,
      snapToState: artwork.snapToState,
      showMetadataOverlay: artwork.showMetadataOverlay,
      overlayFields: artwork.overlayFields,
    },
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
    },
    provenance: provenance ?? emptyProvenance(),
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
}

export function archiveEntryToPerceptionArtwork(entry: ArchiveEntry): PerceptionArtwork {
  return {
    id: entry.slug,
    metadata: entry.metadata,
    imageSrc: entry.assets.artwork,
    states: entry.perception.states,
    background: entry.perception.background,
    initialAngle: entry.perception.initialAngle,
    snapToState: entry.perception.snapToState,
    showMetadataOverlay: entry.perception.showMetadataOverlay,
    overlayFields: entry.perception.overlayFields,
  };
}

export function archiveEntryToExportPayload(entry: ArchiveEntry): ExportPayload {
  return {
    version: 1,
    artwork: archiveEntryToPerceptionArtwork(entry),
    exportedAt: entry.updatedAt,
  };
}

export function draftToPerceptionArtwork(draft: ArchiveDraft): PerceptionArtwork {
  return {
    id: draft.slug,
    metadata: {
      ...draft.artwork.metadata,
      accessionId: draft.accessionId ?? draft.artwork.metadata.accessionId,
    },
    imageSrc: draft.artwork.imageSrc,
    states: draft.artwork.states,
    background: draft.artwork.background,
    initialAngle: draft.artwork.initialAngle,
    snapToState: draft.artwork.snapToState,
    showMetadataOverlay: draft.artwork.showMetadataOverlay,
    overlayFields: draft.artwork.overlayFields,
  };
}

export function draftToArchiveEntry(draft: ArchiveDraft): ArchiveEntry {
  const artwork = draftToPerceptionArtwork(draft);
  const entry = perceptionArtworkToArchiveEntry(
    artwork,
    draft.slug,
    defaultArchiveAssets(draft.slug),
    draft.provenance,
    draft.accessionId,
  );
  entry.accessionId = draft.accessionId;
  entry.status = draft.status === "minted" ? "minted" : "published";
  if (draft.export) {
    entry.export = { ...entry.export, ...draft.export };
  }
  return entry;
}

export function perceptionToStatesFile(
  slug: string,
  perception: ArchivePerception,
): { version: typeof ARCHIVE_VERSION; slug: string; perception: ArchivePerception; exportedAt: string } {
  return {
    version: ARCHIVE_VERSION,
    slug,
    perception,
    exportedAt: new Date().toISOString(),
  };
}

export function accessionDraftToArchiveDraft(
  draft: AccessionDraft,
): ArchiveDraft {
  const parsed = AccessionDraftSchema.parse(draft);
  return {
    accessionId: parsed.accessionId,
    status: parsed.status,
    slug: parsed.slug,
    artwork: {
      ...parsed.artwork,
      id: parsed.slug,
      imageSrc: "",
      metadata: {
        ...parsed.artwork.metadata,
        accessionId: parsed.accessionId,
      },
    },
    provenance: parsed.provenance,
    export: parsed.export,
  };
}
