import { loadArchiveEntry } from "./load-entry";
import {
  type ArchiveEntry,
  type DerivativeAsset,
  type DraftStatus,
} from "./schema";
import {
  canRegenerateStatus,
  isPublicArchiveEntry,
  isPublicArchiveStatus,
  visibilityLabel,
} from "./visibility";

export interface AccessionRuntime {
  accessionId?: string;
  slug: string;
  status: DraftStatus;
  visibility: {
    public: boolean;
    label: string;
    notice?: string;
  };
  metadata: ArchiveEntry["metadata"];
  perception: ArchiveEntry["perception"];
  provenance: ArchiveEntry["provenance"];
  source: ArchiveEntry["source"];
  processing: ArchiveEntry["processing"];
  derivatives: DerivativeAsset[];
  assets: ArchiveEntry["assets"];
  exports: ArchiveEntry["exports"];
  exportSettings: ArchiveEntry["export"];
  prepared: {
    ready: boolean;
    path?: string;
    preparedAt?: string;
    prepareVersion?: string;
  };
  capabilities: {
    canRenderPublicly: boolean;
    canRenderDirectRoute: boolean;
    canRegenerate: boolean;
    canExportMintPackage: boolean;
    hasOriginalSource: boolean;
    hasPreparedSource: boolean;
  };
  updatedAt: string;
  generatedAt?: string;
  publishedAt?: string;
}

export function resolveRuntimeDerivatives(entry: ArchiveEntry): DerivativeAsset[] {
  return entry.derivatives.length > 0
    ? entry.derivatives
    : [
        {
          role: "thumb",
          path: entry.assets.thumb,
          format: "jpeg",
          generatedAt: entry.updatedAt,
        },
        {
          role: "preview",
          path: entry.assets.previewWebp ?? entry.assets.preview,
          format: entry.assets.previewWebp ? "webp" : "avif",
          generatedAt: entry.updatedAt,
        },
        {
          role: "preview",
          path: entry.assets.preview,
          format: "avif",
          generatedAt: entry.updatedAt,
        },
        {
          role: "artwork",
          path: entry.assets.artwork,
          format: "avif",
          generatedAt: entry.updatedAt,
        },
        {
          role: "social",
          path: entry.assets.socialJpg ?? entry.assets.social,
          format: "jpeg",
          generatedAt: entry.updatedAt,
        },
      ];
}

export function resolveRuntimeVisibility(entry: ArchiveEntry): AccessionRuntime["visibility"] {
  const publicEntry = isPublicArchiveEntry(entry);
  return {
    public: publicEntry,
    label: visibilityLabel(entry.status),
    notice: publicEntry
      ? undefined
      : entry.status === "withdrawn"
        ? "This accession has been withdrawn from public circulation. The archival record is preserved for provenance and historical continuity."
        : "This accession is hidden from public listings. Direct access remains available for archival review.",
  };
}

export function buildAccessionRuntime(entry: ArchiveEntry): AccessionRuntime {
  const derivatives = resolveRuntimeDerivatives(entry);
  const hasOriginalSource =
    entry.source?.kind === "original" && Boolean(entry.source.storedFilename);
  const hasPreparedSource = Boolean(entry.processing?.preparedSource);
  return {
    accessionId: entry.metadata.accessionId ?? entry.accessionId,
    slug: entry.slug,
    status: entry.status,
    visibility: resolveRuntimeVisibility(entry),
    metadata: entry.metadata,
    perception: entry.perception,
    provenance: entry.provenance,
    source: entry.source,
    processing: entry.processing,
    derivatives,
    assets: entry.assets,
    exports: entry.exports,
    exportSettings: entry.export,
    prepared: {
      ready: hasPreparedSource,
      path: entry.processing?.preparedSource,
      preparedAt: entry.processing?.preparedAt,
      prepareVersion: entry.processing?.prepareVersion,
    },
    capabilities: {
      canRenderPublicly: isPublicArchiveStatus(entry.status),
      canRenderDirectRoute: true,
      canRegenerate: canRegenerateStatus(entry.status) && hasOriginalSource,
      canExportMintPackage: derivatives.length > 0,
      hasOriginalSource,
      hasPreparedSource,
    },
    updatedAt: entry.updatedAt,
    generatedAt: entry.derivatives[0]?.generatedAt,
    publishedAt: entry.publishedAt,
  };
}

export async function hydrateAccessionRuntime(
  slug: string,
): Promise<AccessionRuntime | null> {
  const entry = await loadArchiveEntry(slug);
  return entry ? buildAccessionRuntime(entry) : null;
}
