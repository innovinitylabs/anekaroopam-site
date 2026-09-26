import type { ConversionOptions } from "@/lib/image-processing/types";
import type { StandaloneExportProfile } from "@/lib/html-export/standalone-profile";
import type { WorkspaceSource } from "./types";

/** Options fields that affect encoded output (stable JSON for fingerprints). */
export function stableConversionOptionsJson(
  options: ConversionOptions,
): string {
  return JSON.stringify({
    format: options.format,
    quality: options.quality,
    lossless: options.lossless,
    maxWidth: options.maxWidth ?? null,
    maxHeight: options.maxHeight ?? null,
    chromaSubsampling: options.chromaSubsampling,
  });
}

export function profileNeedsWebp(profile: StandaloneExportProfile): boolean {
  return profile === "compatible";
}

/**
 * Fingerprint for stale detection.
 * workspaceId|fileName|byteSize|lastModified|stableOptions|needsWebp
 */
export function computePreparationFingerprint(input: {
  workspaceId: string;
  source: Pick<
    WorkspaceSource,
    "fileName" | "byteSize" | "lastModified"
  > | null;
  options: ConversionOptions;
  profile: StandaloneExportProfile;
}): string {
  const src = input.source;
  return [
    input.workspaceId,
    src?.fileName ?? "",
    String(src?.byteSize ?? ""),
    String(src?.lastModified ?? ""),
    stableConversionOptionsJson(input.options),
    profileNeedsWebp(input.profile) ? "webp" : "avif-only",
  ].join("|");
}

export function isPreparedValid(input: {
  fingerprint: string | null;
  preparedAvif: { format: string } | null;
  preparedWebp: unknown | null;
  expectedFingerprint: string;
  profile: StandaloneExportProfile;
}): boolean {
  if (!input.fingerprint || input.fingerprint !== input.expectedFingerprint) {
    return false;
  }
  if (!input.preparedAvif || input.preparedAvif.format !== "avif") {
    return false;
  }
  if (profileNeedsWebp(input.profile) && !input.preparedWebp) {
    return false;
  }
  return true;
}
