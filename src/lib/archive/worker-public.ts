/**
 * Public archive reads from Worker D1 API.
 */

import type { PerceptionArtwork } from "@/lib/perception/types";
import type { ArchiveEntry } from "./schema";
import { ARCHIVE_VERSION, emptyProvenance } from "./schema";
import type { ArchiveSearchParams } from "./archive-search";
import {
  ArchiveWorkerError,
  workerGetPublicArtwork,
  workerListPublicArtworks,
  type WorkerPublicDetail,
} from "./worker-client";
import { classifyWorkerError } from "./worker-outcome";

export type PublicWorkerResult<T> =
  | { ok: true; value: T }
  | { ok: false; outcome: "not_found" | "unavailable"; reason?: string };

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

export async function tryListPublicArtworksFromWorker(
  filters: ArchiveSearchParams = {},
): Promise<PublicWorkerResult<{ artworks: PerceptionArtwork[]; total: number }>> {
  try {
    const value = await listPublicArtworksFromWorker(filters);
    return { ok: true, value };
  } catch (err) {
    const outcome = classifyWorkerError(err);
    if (outcome.kind === "unavailable") {
      return { ok: false, outcome: "unavailable", reason: outcome.reason };
    }
    return { ok: false, outcome: "not_found", reason: outcome.kind };
  }
}

export async function getPublicEntryFromWorker(
  slug: string,
): Promise<ArchiveEntry | null> {
  const result = await tryGetPublicEntryFromWorker(slug);
  return result.ok ? result.value : null;
}

export async function tryGetPublicEntryFromWorker(
  slug: string,
): Promise<PublicWorkerResult<ArchiveEntry | null>> {
  try {
    const { artwork } = await workerGetPublicArtwork(slug);
    return { ok: true, value: detailToEntry(artwork) };
  } catch (err) {
    if (err instanceof ArchiveWorkerError && err.status === 404) {
      return { ok: true, value: null };
    }
    const outcome = classifyWorkerError(err);
    if (outcome.kind === "unavailable") {
      return { ok: false, outcome: "unavailable", reason: outcome.reason };
    }
    return { ok: true, value: null };
  }
}

export async function getPublicArtworkFromWorker(
  slug: string,
): Promise<PerceptionArtwork | null> {
  const entry = await getPublicEntryFromWorker(slug);
  if (!entry) return null;
  return entryToPerception(entry);
}

export async function tryGetPublicArtworkFromWorker(
  slug: string,
): Promise<PublicWorkerResult<PerceptionArtwork | null>> {
  const result = await tryGetPublicEntryFromWorker(slug);
  if (!result.ok) return result;
  if (!result.value) return { ok: true, value: null };
  return { ok: true, value: entryToPerception(result.value) };
}

function entryToPerception(entry: ArchiveEntry): PerceptionArtwork {
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
