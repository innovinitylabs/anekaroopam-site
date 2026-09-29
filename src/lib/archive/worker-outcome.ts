/**
 * Classify Archive Worker failures for gated public fallback.
 * Fallback is allowed only for infrastructure failure - never for 404/miss.
 */

import { ArchiveWorkerError } from "./worker-client";

export type WorkerFetchOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: string; status?: number };

export function classifyWorkerError(err: unknown): WorkerFetchOutcome {
  if (err instanceof ArchiveWorkerError) {
    if (err.status === 404) return { kind: "not_found" };
    if (
      err.status === 502 ||
      err.status === 503 ||
      err.status === 504 ||
      err.status >= 500
    ) {
      return {
        kind: "unavailable",
        reason: err.message,
        status: err.status,
      };
    }
    // 4xx other than 404: treat as miss (no stale fallback)
    return { kind: "not_found" };
  }
  if (err instanceof TypeError || err instanceof Error) {
    const msg = err.message || "network error";
    if (/fetch|network|ECONN|ETIMEDOUT|ENOTFOUND|abort/i.test(msg)) {
      return { kind: "unavailable", reason: msg };
    }
    return { kind: "unavailable", reason: msg };
  }
  return { kind: "unavailable", reason: "unknown worker error" };
}

export function isWorkerInfrastructureFailure(err: unknown): boolean {
  return classifyWorkerError(err).kind === "unavailable";
}
