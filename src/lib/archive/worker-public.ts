/**
 * Public archive reads from Worker D1 API.
 */

import type { PerceptionArtwork } from "@/lib/perception/types";
import type { ArchiveEntry } from "./schema";
import { ARCHIVE_VERSION, emptyProvenance } from "./schema";
import type { ArchiveSearchParams } from "./archive-search";
import {
  workerGetPublicArtwork,
  workerListPublicArtworks,
  type WorkerPublicDetail,
} from "./worker-client";

function detailToEntry(detail: WorkerPublicDetail["artwork"]): ArchiveEntry {
  const assets = detail.assets;
  const meta = {
    ...(detail.metadata as ArchiveEntry["metadata"]),
    title: detail.title,
    year: detail.year ?? undefined,
    process: detail.process ?? undefined,
    accessionId: detail.accessionId,
  };
  return {
    version: ARCHIVE_VERSION,
    accessionId: detail.accessionId,
    slug: detail.slug,
    status: "published",
    metadata: meta,
    assets: {
      artwork: assets.artwork ?? "",
      preview: assets.preview ?? assets.preview_webp ?? "",
      previewWebp: assets.preview_webp ?? assets.preview ?? "",
      social: assets.social ?? "",
      socialJpg: assets.social ?? "",
      thumb: assets.thumb ?? detail.thumbUrl ?? "",
    },
    derivatives: [],
    exports: [],
    perception: {
      states: Array.isArray(detail.perception.states)
        ? (detail.perception.states as ArchiveEntry["perception"]["states"])
        : [],
      background: (detail.perception.background as string) || "paper",
      initialAngle: Number(detail.perception.initialAngle ?? 0),
      snapToState: detail.perception.snapToState !== false,
      showMetadataOverlay: detail.perception.showMetadataOverlay !== false,
      overlayFields: detail.perception.overlayFields as ArchiveEntry["perception"]["overlayFields"],
    },
    export: {
      standaloneHtml:
        (detail.export.standaloneHtml as string) || "perception.html",
      includeWebpFallback: detail.export.includeWebpFallback !== false,
      preset: "archival",
      ...(detail.export as Record<string, unknown>),
    } as ArchiveEntry["export"],
    provenance:
      (detail.provenance as ArchiveEntry["provenance"]) ?? emptyProvenance(),
    createdAt: detail.publishedAt ?? new Date().toISOString(),
    updatedAt: detail.publishedAt ?? new Date().toISOString(),
    publishedAt: detail.publishedAt ?? undefined,
  };
}

export async function listPublicArtworksFromWorker(
  filters: ArchiveSearchParams = {},
): Promise<{ artworks: PerceptionArtwork[]; total: number }> {
  const { artworks, total } = await workerListPublicArtworks(filters);
  return {
    total,
    artworks: artworks.map((a) => ({
      id: a.slug,
      metadata: {
        title: a.title,
        year: a.year ?? undefined,
        process: a.process ?? undefined,
        accessionId: a.accessionId,
      },
      imageSrc: a.thumbUrl ?? "",
      states: [],
      background: "paper",
      initialAngle: 0,
      snapToState: true,
      showMetadataOverlay: true,
    })),
  };
}

export async function getPublicEntryFromWorker(
  slug: string,
): Promise<ArchiveEntry | null> {
  try {
    const { artwork } = await workerGetPublicArtwork(slug);
    return detailToEntry(artwork);
  } catch {
    return null;
  }
}

export async function getPublicArtworkFromWorker(
  slug: string,
): Promise<PerceptionArtwork | null> {
  const entry = await getPublicEntryFromWorker(slug);
  if (!entry) return null;
  return {
    id: entry.slug,
    metadata: entry.metadata,
    imageSrc:
      entry.assets.previewWebp ||
      entry.assets.preview ||
      entry.assets.artwork ||
      entry.assets.thumb,
    states: entry.perception.states,
    background: entry.perception.background,
    initialAngle: entry.perception.initialAngle,
    snapToState: entry.perception.snapToState,
    showMetadataOverlay: entry.perception.showMetadataOverlay,
    overlayFields: entry.perception.overlayFields,
  };
}
