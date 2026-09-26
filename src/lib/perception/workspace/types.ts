import type {
  ConversionOptions,
  ConversionResult,
  ExportPresetId,
  ImageAnalysis,
} from "@/lib/image-processing/types";
import type { StandaloneExportProfile } from "@/lib/html-export/standalone-profile";
import type { estimateHtmlExport } from "@/lib/html-export/estimate";
import type { PerceptionArtwork } from "@/lib/perception/types";
import type { StoredPerceptionArtwork } from "@/lib/export-engine/session-artwork";

export type PreparationStatus =
  | "idle"
  | "analyzing"
  | "converting"
  | "ready"
  | "stale"
  | "error";

export type ExportStatus = "idle" | "exporting" | "done" | "error";

export type WorkspaceSource = {
  registryKey: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  lastModified?: number;
  objectUrl: string | null;
};

export type WorkspacePreparation = {
  options: ConversionOptions;
  presetId: ExportPresetId;
  analysis: ImageAnalysis | null;
  status: PreparationStatus;
  error: string | null;
  preparedAvif: ConversionResult | null;
  preparedWebp: ConversionResult | null;
  fingerprint: string | null;
};

export type WorkspaceExport = {
  profile: StandaloneExportProfile;
  status: ExportStatus;
  error: string | null;
  lastEstimate: ReturnType<typeof estimateHtmlExport> | null;
  lastHtmlByteSize?: number;
};

/** In-memory runtime state for the Pattarai workspace (Context). */
export type PattaraiWorkspaceRuntime = {
  workspaceId: string;
  source: WorkspaceSource | null;
  artwork: PerceptionArtwork;
  customBackground: string;
  preparation: WorkspacePreparation;
  export: WorkspaceExport;
};

/**
 * Serializable snapshot — no File, Blob, dataUrl, or ConversionResult.
 * Safe for sessionStorage.
 */
export type PattaraiWorkspaceSnapshot = {
  version: 1;
  workspaceId: string;
  artwork: StoredPerceptionArtwork;
  customBackground: string;
  source: {
    registryKey: string;
    fileName?: string;
    mimeType?: string;
    byteSize?: number;
    lastModified?: number;
  } | null;
  preparation: {
    options: ConversionOptions;
    presetId: ExportPresetId;
    status: PreparationStatus;
    fingerprint: string | null;
  };
  export: {
    profile: StandaloneExportProfile;
  };
  savedAt: string;
};

export const PATTARAI_WORKSPACE_SNAPSHOT_KEY =
  "anekaroopam-pattarai-workspace-v1" as const;
