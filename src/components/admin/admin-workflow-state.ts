import type { AccessionDraft, DraftStatus } from "@/lib/archive/schema";

const ARCHIVE_BUNDLE_DRAFT_STATUSES = new Set<DraftStatus>([
  "generated",
  "published",
  "minted",
  "hidden",
  "withdrawn",
]);

const SYNC_DEPLOY_STATUSES = new Set<DraftStatus>([
  "published",
  "minted",
  "hidden",
  "withdrawn",
]);

/** Archive bundle already exists on disk (regenerate semantics). */
export function isExistingArchiveBundle(
  draft: Pick<AccessionDraft, "status"> | null,
  draftId: string,
  archiveStatus?: DraftStatus | null,
): boolean {
  if (draftId.startsWith("edit-")) return true;
  if (archiveStatus != null) return true;
  const draftStatus = draft?.status;
  return draftStatus != null && ARCHIVE_BUNDLE_DRAFT_STATUSES.has(draftStatus);
}

/** Publish step uses sync (lifecycle-neutral) rather than publish promotion. */
export function usesSyncOnPublishStep(
  draft: Pick<AccessionDraft, "status"> | null,
  draftId: string,
  archiveStatus?: DraftStatus | null,
): boolean {
  void draftId;
  const status = archiveStatus ?? draft?.status;
  if (status == null) return false;
  if (status === "generated") return false;
  return SYNC_DEPLOY_STATUSES.has(status);
}

export function generateEndpointKind(
  draft: Pick<AccessionDraft, "status"> | null,
  draftId: string,
  archiveStatus?: DraftStatus | null,
): "regenerate" | "generate" {
  return isExistingArchiveBundle(draft, draftId, archiveStatus)
    ? "regenerate"
    : "generate";
}

export function showPublishToGitHubAction(archiveStatus: string): boolean {
  return archiveStatus === "generated";
}

export function isRegenerateBlocked(
  draftStatus: string,
  archiveStatus: string | null,
): boolean {
  return archiveStatus === "withdrawn" || draftStatus === "withdrawn";
}

export function draftArchiveStatusesDiffer(
  draftStatus: string,
  archiveStatus: string | null,
): boolean {
  return archiveStatus != null && archiveStatus !== draftStatus;
}

export function formatWizardStatusHeader(input: {
  draftId: string;
  draftStatus: string;
  archiveStatus: string | null;
}): string {
  const id = input.draftId || "Preparing draft";
  if (!draftArchiveStatusesDiffer(input.draftStatus, input.archiveStatus)) {
    return `${id} · draft ${input.draftStatus}`;
  }
  return `${id} · draft ${input.draftStatus} · archive ${input.archiveStatus}`;
}
