/**
 * Standalone HTML export profiles for NFT/offline packages.
 *
 * onchain — single AVIF embed, minified, no WebP/CDN/archive derivatives in HTML
 * compatible — AVIF primary + optional WebP fallback, still fully offline
 */

export type StandaloneExportProfile = "onchain" | "compatible";

export const STANDALONE_EXPORT_PROFILES = ["onchain", "compatible"] as const;

export function parseStandaloneExportProfile(
  raw: string | null | undefined,
): StandaloneExportProfile {
  if (raw === "onchain" || raw === "compatible") return raw;
  return "compatible";
}

export type StandaloneSizeReport = {
  profile: StandaloneExportProfile;
  htmlByteSize: number;
  embeddedAvifByteSize: number;
  embeddedWebpByteSize: number | null;
};

export type StandaloneBuildResult = StandaloneSizeReport & {
  html: string;
};

/** Patterns that must not appear in an on-chain offline package. */
export const ONCHAIN_FORBIDDEN_PATTERNS = [
  /data:image\/webp/i,
  /type=["']image\/webp["']/i,
  /https?:\/\//i,
  /r2\.cloudflarestorage/i,
  /\.r2\.dev/i,
  /cdn\./i,
  /fonts\.googleapis/i,
  /fonts\.gstatic/i,
  /unpkg\.com/i,
  /jsdelivr\.net/i,
  /esm\.sh/i,
] as const;

export function assertOnchainStandaloneHtml(html: string): void {
  if (!/data:image\/avif/i.test(html)) {
    throw new Error("onchain HTML must embed AVIF data");
  }
  for (const pattern of ONCHAIN_FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(
        `onchain HTML contains forbidden pattern: ${pattern.source}`,
      );
    }
  }
}

export function countDataUrlOccurrences(html: string, mime: string): number {
  const re = new RegExp(
    `data:${mime.replace("/", "\\/")}(?:;base64)?,`,
    "gi",
  );
  return (html.match(re) ?? []).length;
}
