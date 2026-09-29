import type { ArchiveEntry, DraftStatus } from "./schema";

/**
 * True only for never-published local generates.
 * Fail closed: published/minted/hidden/withdrawn, or any publication timestamps,
 * are never discardable — even if status were wrongly set to "generated".
 */
export function isArchiveDiscardable(entry: ArchiveEntry): boolean {
  if (entry.status !== "generated") return false;
  if (entry.publishedAt) return false;
  if (entry.mintedAt) return false;
  return true;
}

/** Throws when an archive must not be discarded. */
export function assertArchiveDiscardable(entry: ArchiveEntry): void {
  if (!isArchiveDiscardable(entry)) {
    throw new Error(
      "Archive is not discardable: only never-published generated records can be discarded.",
    );
  }
}

export function archiveStatusFromDraft(status?: DraftStatus): DraftStatus {
  if (
    status === "published" ||
    status === "minted" ||
    status === "hidden" ||
    status === "withdrawn"
  ) {
    return status;
  }
  return "generated";
}

export function bytesForArchiveSourceDeposit(
  original: Buffer,
  prepared: Buffer | null,
): Buffer {
  void prepared;
  return original;
}

/** Archival derivatives always encode from the deposited original, never prepared AVIF. */
export function bytesForArchiveDerivativeGenerate(
  original: Buffer,
  prepared: Buffer | null,
): Buffer {
  void prepared;
  return original;
}

/** Explicit alias documenting the original-only derivative invariant. */
export function originalBytesForArchiveDerivatives(
  original: Buffer,
  prepared?: Buffer | null,
): Buffer {
  return bytesForArchiveDerivativeGenerate(original, prepared ?? null);
}

/**
 * Prefer draft source bytes when metadata and disk agree; otherwise use archive.
 * Pure policy helper for regenerate fallback (unit-tested).
 */
export function preferDraftSourceForRegenerate(
  draftHasFilename: boolean,
  draftBytesReadable: boolean,
): boolean {
  return draftHasFilename && draftBytesReadable;
}

export function keepExplicitPatchKeys(
  patch: object,
  parsed: object,
): Record<string, unknown> {
  const assigned: Record<string, unknown> = {};
  const parsedRecord = parsed as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      assigned[key] = parsedRecord[key];
    }
  }
  return assigned;
}

export function hasDepositedArchiveSource(entry: ArchiveEntry): boolean {
  return entry.source?.kind === "original" && Boolean(entry.source.storedFilename);
}

export function shouldDepositDraftSourceInArchive(
  existingEntry?: ArchiveEntry | null,
): boolean {
  if (!existingEntry) return true;
  return !hasDepositedArchiveSource(existingEntry);
}
