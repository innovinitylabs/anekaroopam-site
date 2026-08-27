import type { ArchiveEntry, DraftStatus } from "./schema";

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
