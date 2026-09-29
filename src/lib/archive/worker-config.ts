/**
 * Cloudflare archive Worker configuration (server-only).
 * Token never leaves the Next.js server.
 */

export function getArchiveWorkerUrl(): string | null {
  const raw = process.env.ARCHIVE_WORKER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function getArchiveWorkerToken(): string | null {
  const token = process.env.ARCHIVE_WORKER_TOKEN?.trim();
  return token || null;
}

export function isArchiveWorkerConfigured(): boolean {
  return Boolean(getArchiveWorkerUrl() && getArchiveWorkerToken());
}

/** When Worker is configured, it is the metadata SoT; GitHub content-store is idle. */
export function preferArchiveWorker(): boolean {
  if (!isArchiveWorkerConfigured()) return false;
  const forceGithub = process.env.ARCHIVE_PREFER_GITHUB_STORE === "true";
  return !forceGithub;
}
