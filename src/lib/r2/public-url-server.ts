/**
 * Server-only helpers that resolve public URLs from env-backed R2 config.
 */

import "server-only";

import { getR2Config } from "./config";
import { publicUrlForR2Key } from "./public-url";

export function tryPublicUrlForR2Key(key: string): string | null {
  const config = getR2Config();
  if (!config) return null;
  return publicUrlForR2Key(key, config.publicBaseUrl);
}
