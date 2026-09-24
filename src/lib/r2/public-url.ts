/**
 * Client-safe public CDN URL helpers.
 * Never import server R2 config or credentials from this module.
 */

/** Build a public media URL from an R2 object key and public base URL. */
export function publicUrlForR2Key(key: string, publicBaseUrl: string): string {
  const base = publicBaseUrl.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("publicBaseUrl is required");
  }
  const normalizedKey = key.replace(/^\//, "");
  return `${base}/${normalizedKey}`;
}

/** True when a path is already an absolute http(s) media URL. */
export function isAbsoluteMediaUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}
