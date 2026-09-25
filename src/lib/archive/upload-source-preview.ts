/**
 * Upload-tab helpers: local preview metadata and pipeline status labels.
 */

import { formatByteSize } from "./commit-bundle-limits";

export type SourcePreviewMeta = {
  name: string;
  sizeLabel: string;
  typeLabel: string;
  width: number | null;
  height: number | null;
};

export type SourcePipelineStatus = {
  selectedLocally: boolean;
  preparedLocally: boolean;
  uploadedToR2: boolean;
  published: boolean;
};

export function buildSourcePreviewMeta(
  file: File,
  dimensions?: { width: number; height: number } | null,
): SourcePreviewMeta {
  return {
    name: file.name,
    sizeLabel: formatByteSize(file.size),
    typeLabel: file.type?.trim() || "application/octet-stream",
    width: dimensions?.width && dimensions.width > 0 ? dimensions.width : null,
    height:
      dimensions?.height && dimensions.height > 0 ? dimensions.height : null,
  };
}

/** Best-effort natural dimensions for a browser File (image decode). */
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Derive pipeline status for Upload UI.
 * uploadedToR2: server deposited original (working tip) without requiring publish.
 * published: archive/draft status is published.
 */
export function deriveSourcePipelineStatus(input: {
  hasSourceFile: boolean;
  hasPreparedLocal: boolean;
  serverSourceKind?: string;
  archiveStatus?: string | null;
  draftStatus?: string | null;
  commitCompleted?: boolean;
}): SourcePipelineStatus {
  const status = input.archiveStatus ?? input.draftStatus ?? "";
  const published =
    Boolean(input.commitCompleted) || status === "published";
  const uploadedToR2 =
    published || input.serverSourceKind === "original";
  return {
    selectedLocally: input.hasSourceFile,
    preparedLocally: input.hasPreparedLocal,
    uploadedToR2,
    published,
  };
}

export const PIPELINE_STATUS_LABELS = {
  selectedLocally: "Selected locally",
  preparedLocally: "Prepared locally",
  uploadedToR2: "Uploaded to R2",
  published: "Published",
} as const;
