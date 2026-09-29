/**
 * Server-side validation of R2 object keys registered as artwork assets.
 * Mirrors src/lib/r2/object-keys.ts in the Next app:
 *   {prefix}archive/{accessionId}/r{revision}/original/original.{ext}
 *   {prefix}archive/{accessionId}/r{revision}/prepared/master-prepared.avif
 *   {prefix}archive/{accessionId}/r{revision}/derivatives/{filename}
 */

const STORED_ORIGINAL_RE = /^original\.[a-z0-9]+$/;
const PREPARED_FILENAME = "master-prepared.avif";

const DERIVATIVE_FILENAME_BY_ROLE: Record<string, string> = {
  artwork: "artwork.avif",
  preview: "preview.avif",
  preview_webp: "preview.webp",
  social: "social.jpg",
  thumb: "thumb.jpg",
};

export function normalizeKeyPrefix(prefix: string | undefined | null): string {
  if (!prefix?.trim()) return "";
  return `${prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "")}/`;
}

export type AssetKeyCheck = { ok: true } | { ok: false; error: string };

export function validateAssetObjectKey(input: {
  objectKey: string;
  role: string;
  keyPrefix: string | undefined | null;
  accessionId: string;
  workingRevision: number;
}): AssetKeyCheck {
  const prefix = normalizeKeyPrefix(input.keyPrefix);
  if (!prefix) {
    return {
      ok: false,
      error: "R2_KEY_PREFIX is not configured; refusing asset registration",
    };
  }
  const key = input.objectKey;
  if (key.includes("..") || key.includes("//")) {
    return { ok: false, error: `Invalid object key: ${key}` };
  }
  if (!key.startsWith(prefix)) {
    return {
      ok: false,
      error: `Object key is outside the "${prefix}" namespace: ${key}`,
    };
  }

  const expected = `archive/${input.accessionId}/r${input.workingRevision}/`;
  const logical = key.slice(prefix.length);
  if (!logical.startsWith(expected)) {
    return {
      ok: false,
      error: `Object key does not belong to ${input.accessionId} working revision r${input.workingRevision}: ${key}`,
    };
  }

  const rest = logical.slice(expected.length);
  let valid = false;
  if (input.role === "original") {
    valid =
      rest.startsWith("original/") &&
      STORED_ORIGINAL_RE.test(rest.slice("original/".length));
  } else if (input.role === "prepared") {
    valid = rest === `prepared/${PREPARED_FILENAME}`;
  } else if (
    Object.prototype.hasOwnProperty.call(DERIVATIVE_FILENAME_BY_ROLE, input.role)
  ) {
    valid = rest === `derivatives/${DERIVATIVE_FILENAME_BY_ROLE[input.role]}`;
  }
  if (!valid) {
    return {
      ok: false,
      error: `Object key does not match role "${input.role}": ${key}`,
    };
  }
  return { ok: true };
}
