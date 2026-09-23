/**
 * Map R2 object keys to public CDN URLs.
 */

import { getR2Config, requireR2Config } from "./config";

export function publicUrlForR2Key(key: string, publicBaseUrl?: string): string {
  const base =
    publicBaseUrl?.replace(/\/$/, "") ??
    requireR2Config().publicBaseUrl.replace(/\/$/, "");
  const normalizedKey = key.replace(/^\//, "");
  return `${base}/${normalizedKey}`;
}

export function tryPublicUrlForR2Key(key: string): string | null {
  const config = getR2Config();
  if (!config) return null;
  return publicUrlForR2Key(key, config.publicBaseUrl);
}

/** True when a path is already an absolute http(s) media URL. */
export function isAbsoluteMediaUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}
