import type { DraftStatus } from "./schema";

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

export function bytesForArchiveDerivativeGenerate(
  original: Buffer,
  prepared: Buffer | null,
): Buffer {
  return prepared ?? original;
}
