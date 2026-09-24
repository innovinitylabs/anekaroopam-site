/**
 * Shared size limits for archive originals and commit payloads.
 *
 * MAX_SOURCE_BYTES caps the editable original for R2 upload, admin
 * hydration (GetObject proxy), and browser prepare. It is independent of
 * the multipart commit-bundle body cap used by the legacy non-R2 path.
 */

/** Max editable original master (upload + hydrate + prepare). */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** Total binary payload soft limit for multipart commit-bundle (source + prepared + derivatives). */
export const MAX_BUNDLE_BINARY_BYTES = 3_800_000;
/** Server hard reject for multipart commit-bundle (must fit under platform body limit ~4.5MB). */
export const MAX_COMMIT_BUNDLE_BYTES = 4_000_000;
export const MAX_COMMIT_FILES = 64;

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** True when an original is within the shared source master limit. */
export function isSourceWithinLimit(byteSize: number): boolean {
  return Number.isFinite(byteSize) && byteSize >= 0 && byteSize <= MAX_SOURCE_BYTES;
}

export function sourceOverLimitMessage(byteSize: number): string {
  return `Original asset is ${formatByteSize(byteSize)} (limit ${formatByteSize(MAX_SOURCE_BYTES)}). Re-select a smaller master locally.`;
}

export function assertCommitBundleClientLimits(input: {
  sourceBytes: number;
  binaryBytes: number;
}): void {
  if (input.sourceBytes > MAX_SOURCE_BYTES) {
    throw new Error(
      `Source file is ${formatByteSize(input.sourceBytes)} (limit ${formatByteSize(MAX_SOURCE_BYTES)}). Compress or resize before Commit.`,
    );
  }
  if (input.binaryBytes > MAX_BUNDLE_BINARY_BYTES) {
    throw new Error(
      `Total binary bundle is ${formatByteSize(input.binaryBytes)} (limit ${formatByteSize(MAX_BUNDLE_BINARY_BYTES)}). Reduce source size or omit duplicate files.`,
    );
  }
}
