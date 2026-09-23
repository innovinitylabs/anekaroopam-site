/**
 * Client/server shared limits for browser commit-bundle payloads.
 * Vercel serverless request body limit is ~4.5MB; stay under with margin.
 */

/** Soft client guard before building the multipart body. */
export const MAX_SOURCE_BYTES = 2_500_000;
/** Total binary payload soft limit (source + prepared + derivatives). */
export const MAX_BUNDLE_BINARY_BYTES = 3_800_000;
/** Server hard reject (must fit under platform body limit). */
export const MAX_COMMIT_BUNDLE_BYTES = 4_000_000;
export const MAX_COMMIT_FILES = 64;

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
