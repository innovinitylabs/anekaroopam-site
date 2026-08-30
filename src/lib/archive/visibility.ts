import type { ArchiveEntry, DraftStatus } from "./schema";

const VISIBILITY_API_STATUSES = new Set<DraftStatus>([
  "published",
  "minted",
  "hidden",
  "withdrawn",
]);

export type VisibilityTransitionKind =
  | "hide"
  | "unhide"
  | "withdraw"
  | "restore"
  | "other";

export function isPublicArchiveStatus(status: DraftStatus | undefined): boolean {
  // Local generate writes status "generated". Those records remain visible on
  // this site. GitHub publish is a separate step that marks them "published".
  return status !== "hidden" && status !== "withdrawn";
}

export function isPublicArchiveEntry(entry: ArchiveEntry): boolean {
  return isPublicArchiveStatus(entry.status);
}

export function visibilityLabel(status: DraftStatus | undefined): string {
  if (status === "hidden") return "hidden";
  if (status === "withdrawn") return "withdrawn";
  if (status === "minted") return "minted";
  if (status === "published") return "published";
  return status ?? "published";
}

export function canRegenerateStatus(status: DraftStatus | undefined): boolean {
  return status !== "withdrawn";
}

/** Throws when an archive must not be regenerated. */
export function assertArchiveRegenerable(entry: ArchiveEntry): void {
  if (!canRegenerateStatus(entry.status)) {
    throw new Error(
      "Archive is withdrawn and cannot be regenerated. Restore it before regenerating.",
    );
  }
}

export function resolveVisibilityRestoreTarget(
  entry: ArchiveEntry,
): "minted" | "published" {
  if (entry.mintedAt || entry.status === "minted") return "minted";
  return "published";
}

export function visibilityTransitionKind(
  previous: DraftStatus,
  next: DraftStatus,
): VisibilityTransitionKind {
  if (next === "hidden" && previous !== "hidden") return "hide";
  if (previous === "hidden" && (next === "published" || next === "minted")) {
    return "unhide";
  }
  if (next === "withdrawn" && previous !== "withdrawn") return "withdraw";
  if (previous === "withdrawn" && (next === "published" || next === "minted")) {
    return "restore";
  }
  return "other";
}

export function assertVisibilityTransition(
  entry: ArchiveEntry,
  nextStatus: DraftStatus,
): void {
  if (!VISIBILITY_API_STATUSES.has(nextStatus)) {
    throw new Error("Invalid archive visibility status");
  }
  if (entry.status === nextStatus) {
    throw new Error(`Archive is already ${nextStatus}`);
  }

  const kind = visibilityTransitionKind(entry.status, nextStatus);

  if (kind === "unhide" || kind === "restore") {
    const expected = resolveVisibilityRestoreTarget(entry);
    if (nextStatus !== expected) {
      throw new Error(
        `Invalid visibility restore target: expected ${expected} for this archive`,
      );
    }
    return;
  }

  if (kind === "hide") {
    if (entry.status === "withdrawn") {
      throw new Error("Cannot hide a withdrawn archive; restore it first");
    }
    return;
  }

  if (kind === "withdraw") {
    if (entry.status === "withdrawn") {
      throw new Error("Archive is already withdrawn");
    }
    return;
  }

  throw new Error(
    `Invalid visibility transition: ${entry.status} -> ${nextStatus}`,
  );
}
