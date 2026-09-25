/**
 * Shared size limits for archive originals and commit payloads.
 *
 * Three tiers (do not conflate):
 * 1. Original master — MAX_SOURCE_BYTES / resolveMaxSourceBytes()
 *    Editable archival original for R2 upload, admin hydration, prepare.
 * 2. Prepared derivative — no separate byte ceiling (encode quality only).
 *    Do not force PNG masters into the public AVIF budget.
 * 3. Public / commit-bundle budget — MAX_BUNDLE_BINARY_BYTES +
 *    MAX_COMMIT_BUNDLE_BYTES for legacy multipart GitHub path only
 *    (platform ~4.5 MB body). R2 direct PUT bypasses these.
 */

/** Default archival original master limit (10 MiB). */
export const DEFAULT_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/**
 * Resolve archival master limit.
 * Prefers ARCHIVE_MAX_SOURCE_BYTES (server) or NEXT_PUBLIC_ARCHIVE_MAX_SOURCE_BYTES
 * (client/UI). Falls back to DEFAULT_MAX_SOURCE_BYTES.
 */
export function resolveMaxSourceBytes(): number {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.ARCHIVE_MAX_SOURCE_BYTES?.trim() ||
        process.env.NEXT_PUBLIC_ARCHIVE_MAX_SOURCE_BYTES?.trim())) ||
    "";
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return DEFAULT_MAX_SOURCE_BYTES;
}

/**
 * Client/UI constant (build-time default). Server enforcement should call
 * resolveMaxSourceBytes() so ARCHIVE_MAX_SOURCE_BYTES env overrides apply.
 */
export const MAX_SOURCE_BYTES = DEFAULT_MAX_SOURCE_BYTES;

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
export function isSourceWithinLimit(
  byteSize: number,
  limit: number = resolveMaxSourceBytes(),
): boolean {
  return Number.isFinite(byteSize) && byteSize >= 0 && byteSize <= limit;
}

export function sourceOverLimitMessage(
  byteSize: number,
  limit: number = resolveMaxSourceBytes(),
): string {
  return `Original asset is ${formatByteSize(byteSize)} (limit ${formatByteSize(limit)}). Re-select a smaller master locally.`;
}

export function assertCommitBundleClientLimits(input: {
  sourceBytes: number;
  binaryBytes: number;
}): void {
  const sourceLimit = resolveMaxSourceBytes();
  if (input.sourceBytes > sourceLimit) {
    throw new Error(
      `Source file is ${formatByteSize(input.sourceBytes)} (limit ${formatByteSize(sourceLimit)}). Compress or resize before Commit.`,
    );
  }
  if (input.binaryBytes > MAX_BUNDLE_BINARY_BYTES) {
    throw new Error(
      `Total binary bundle is ${formatByteSize(input.binaryBytes)} (limit ${formatByteSize(MAX_BUNDLE_BINARY_BYTES)}). Reduce source size or omit duplicate files.`,
    );
  }
}
