/**
 * Shared browser PUT header helpers (safe for client and tests).
 * Content-Length must never be set by application code for browser fetch.
 */

export function browserPresignedPutHeaders(contentType: string): {
  "Content-Type": string;
} {
  if (!contentType.trim()) {
    throw new Error("contentType is required");
  }
  return { "Content-Type": contentType };
}
