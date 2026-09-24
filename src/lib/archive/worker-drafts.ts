/**
 * Bridge Worker D1 artworks to AccessionDraft shapes used by admin UI.
 */

import {
  ARCHIVE_VERSION,
  emptyProvenance,
  type AccessionDraft,
  type CreateAccessionDraftInput,
} from "./schema";
import {
  ArchiveWorkerError,
  workerCreateArtwork,
  workerGetArtwork,
  workerListArtworks,
  workerPatchArtwork,
  type WorkerArtwork,
  type WorkerArtworkDetail,
} from "./worker-client";

function draftIdForCreate(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `draft-${year}-${rand}`;
}

function mapStatus(status: string): AccessionDraft["status"] {
  switch (status) {
    case "ready":
      return "generated";
    case "published":
      return "published";
    case "hidden":
      return "hidden";
    case "withdrawn":
      return "withdrawn";
    default:
      return "draft";
  }
}

function artworkToDraft(
  artwork: WorkerArtwork,
  detail?: WorkerArtworkDetail | null,
): AccessionDraft {
  const working = detail?.workingRevision;
  const meta = {
    title: artwork.title,
    year: artwork.year ?? undefined,
    process: artwork.process ?? undefined,
    accessionId: artwork.accessionId,
    ...(working?.metadata ?? {}),
  } as AccessionDraft["artwork"]["metadata"];
  meta.accessionId = artwork.accessionId;
  if (!meta.title) meta.title = artwork.title;

  const perception = working?.perception ?? {};
  const states = Array.isArray(perception.states) ? perception.states : [];
  const provenance =
    (working?.provenance as AccessionDraft["provenance"] | undefined) ??
    emptyProvenance();

  return {
    version: ARCHIVE_VERSION,
    draftId: artwork.draftId,
    accessionId: artwork.accessionId,
    status: mapStatus(artwork.status),
    slug: artwork.slug,
    slugLocked: true,
    slugHistory: [],
    source: { kind: "migration-required" },
    processing: {},
    artwork: {
      id: artwork.draftId,
      metadata: meta,
      imageSrc: "",
      states: states as AccessionDraft["artwork"]["states"],
      background: (perception.background as string) || "paper",
      initialAngle: Number(perception.initialAngle ?? 0),
      snapToState: perception.snapToState !== false,
      showMetadataOverlay: perception.showMetadataOverlay !== false,
      overlayFields: perception.overlayFields as AccessionDraft["artwork"]["overlayFields"],
    },
    provenance,
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
      ...((working?.export as Record<string, unknown> | undefined) ?? {}),
    } as AccessionDraft["export"],
    createdAt: artwork.createdAt,
    updatedAt: artwork.updatedAt,
    publishedAt: artwork.publishedAt ?? undefined,
    hiddenAt: artwork.hiddenAt ?? undefined,
    withdrawnAt: artwork.withdrawnAt ?? undefined,
  };
}

export async function createDraftViaWorker(
  input: CreateAccessionDraftInput,
): Promise<AccessionDraft> {
  const draftId = draftIdForCreate();
  const { artwork } = await workerCreateArtwork({
    draftId,
    title: input.title,
    slug: input.slug,
    idempotencyKey: `create:${draftId}`,
  });
  const detail = await workerGetArtwork(artwork.id);
  return artworkToDraft(artwork, detail);
}

export async function listDraftsViaWorker(): Promise<AccessionDraft[]> {
  const { artworks } = await workerListArtworks({ limit: 100 });
  return artworks.map((a) => artworkToDraft(a));
}

export async function findWorkerArtworkByDraftOrSlug(input: {
  draftId?: string;
  slug?: string;
  accessionId?: string;
}): Promise<WorkerArtwork | null> {
  const { artworks } = await workerListArtworks({ limit: 200 });
  return (
    artworks.find(
      (a) =>
        (input.draftId && a.draftId === input.draftId) ||
        (input.slug && a.slug === input.slug) ||
        (input.accessionId && a.accessionId === input.accessionId),
    ) ?? null
  );
}

export async function loadDraftViaWorker(
  draftIdOrArtworkId: string,
): Promise<AccessionDraft | null> {
  try {
    const { artworks } = await workerListArtworks({ limit: 200 });
    const match =
      artworks.find((a) => a.draftId === draftIdOrArtworkId) ||
      artworks.find((a) => a.id === draftIdOrArtworkId) ||
      artworks.find((a) => a.accessionId === draftIdOrArtworkId) ||
      artworks.find((a) => a.slug === draftIdOrArtworkId);
    if (!match) return null;
    const detail = await workerGetArtwork(match.id);
    return artworkToDraft(match, detail);
  } catch (e) {
    if (e instanceof ArchiveWorkerError && e.status === 404) return null;
    throw e;
  }
}

export async function ensureWorkerArtworkForDraft(input: {
  draftId: string;
  title?: string;
  slug?: string;
  idempotencyKey?: string;
}): Promise<WorkerArtwork> {
  const existing = await findWorkerArtworkByDraftOrSlug({
    draftId: input.draftId,
    slug: input.slug,
  });
  if (existing) return existing;
  const { artwork } = await workerCreateArtwork({
    draftId: input.draftId,
    title: input.title,
    slug: input.slug,
    idempotencyKey: input.idempotencyKey ?? `ensure:${input.draftId}`,
  });
  return artwork;
}

export async function updateDraftViaWorker(
  draftId: string,
  patch: {
    slug?: string;
    artwork?: AccessionDraft["artwork"];
    provenance?: AccessionDraft["provenance"];
    export?: AccessionDraft["export"];
  },
): Promise<AccessionDraft> {
  const row = await findWorkerArtworkByDraftOrSlug({ draftId });
  if (!row) {
    throw new ArchiveWorkerError(404, "Draft not found in archive Worker");
  }

  const metadata = patch.artwork?.metadata
    ? {
        ...patch.artwork.metadata,
        accessionId: row.accessionId,
        title: patch.artwork.metadata.title ?? row.title,
      }
    : undefined;

  const perception = patch.artwork
    ? {
        states: patch.artwork.states,
        background: patch.artwork.background,
        initialAngle: patch.artwork.initialAngle,
        snapToState: patch.artwork.snapToState,
        showMetadataOverlay: patch.artwork.showMetadataOverlay,
        overlayFields: patch.artwork.overlayFields,
      }
    : undefined;

  const { artwork } = await workerPatchArtwork(row.id, {
    metadata,
    perception,
    export: patch.export,
    provenance: patch.provenance,
    slug: patch.slug,
  });
  const detail = await workerGetArtwork(artwork.id);
  return artworkToDraft(artwork, detail);
}
