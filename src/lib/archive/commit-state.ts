/** Recoverable commit phases for R2 + GitHub metadata flow. */

export type ArchiveCommitPhase =
  | "idle"
  | "preparing"
  | "authorizing"
  | "uploading"
  | "verifying"
  | "uploaded_pending_metadata"
  | "committing_metadata"
  | "committed"
  | "failed_upload"
  | "failed_verify"
  | "failed_metadata";

export interface ArchiveCommitState {
  phase: ArchiveCommitPhase;
  accessionId?: string;
  revision?: number;
  uploadedKeys?: string[];
  commitSha?: string;
  error?: string;
}

export function commitPhaseIsSuccess(phase: ArchiveCommitPhase): boolean {
  return phase === "committed";
}

export function commitPhaseAllowsMetadataRetry(
  phase: ArchiveCommitPhase,
): boolean {
  return (
    phase === "uploaded_pending_metadata" || phase === "failed_metadata"
  );
}

export function commitPhaseLabel(phase: ArchiveCommitPhase): string {
  switch (phase) {
    case "idle":
      return "Ready";
    case "preparing":
      return "Preparing derivatives";
    case "authorizing":
      return "Authorizing uploads";
    case "uploading":
      return "Uploading to R2";
    case "verifying":
      return "Verifying uploads";
    case "uploaded_pending_metadata":
      return "Media uploaded; metadata not written";
    case "committing_metadata":
      return "Writing revision metadata";
    case "committed":
      return "Published";
    case "failed_upload":
      return "Upload failed";
    case "failed_verify":
      return "Verification failed";
    case "failed_metadata":
      return "Metadata write failed";
    default:
      return phase;
  }
}
