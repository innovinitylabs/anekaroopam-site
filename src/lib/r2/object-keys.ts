/**
 * Deterministic R2 object key builders and validators.
 * Keys never include browser-local draft ids.
 *
 * Optional R2_KEY_PREFIX (e.g. "dev/") isolates dig objects in a shared bucket.
 * Logical keys remain archive/{accessionId}/r{n}/...; stored keys may be prefixed.
 */

import { ARCHIVE_IMAGE_OUTPUTS } from "@/lib/archive/image-specs";

const ACCESSION_ID_RE = /^AR-\d{4}-\d{4,}$/;
const STORED_ORIGINAL_RE = /^original\.[a-z0-9]+$/;
const LOGICAL_KEY_RE =
  /^archive\/(AR-\d{4}-\d{4,})\/r(\d+)\//;

export const R2_PREPARED_FILENAME = "master-prepared.avif";

export type R2MediaRole =
  | "original"
  | "prepared"
  | "artwork"
  | "preview"
  | "previewWebp"
  | "social"
  | "thumb";

const DERIVATIVE_FILENAMES: Record<
  Exclude<R2MediaRole, "original" | "prepared">,
  string
> = {
  artwork: ARCHIVE_IMAGE_OUTPUTS.artwork.filename,
  preview: ARCHIVE_IMAGE_OUTPUTS.previewAvif.filename,
  previewWebp: ARCHIVE_IMAGE_OUTPUTS.previewWebp.filename,
  social: ARCHIVE_IMAGE_OUTPUTS.socialJpg.filename,
  thumb: ARCHIVE_IMAGE_OUTPUTS.thumbJpg.filename,
};

/** Normalize to "" or a single trailing-slash prefix without a leading slash. */
export function normalizeR2KeyPrefix(prefix: string | undefined | null): string {
  if (!prefix?.trim()) return "";
  return `${prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "")}/`;
}

/**
 * Read R2_KEY_PREFIX from the environment (server or build-time).
 * Empty in production unless explicitly set; dig Preview should use `dev/`.
 */
export function getR2KeyPrefixFromEnv(): string {
  if (typeof process === "undefined" || !process.env) return "";
  return normalizeR2KeyPrefix(process.env.R2_KEY_PREFIX);
}

export function withR2KeyPrefix(
  logicalKey: string,
  prefix: string | undefined | null = getR2KeyPrefixFromEnv(),
): string {
  const p = normalizeR2KeyPrefix(prefix);
  if (!p) return logicalKey;
  if (logicalKey.startsWith(p)) return logicalKey;
  return `${p}${logicalKey}`;
}

export function withoutR2KeyPrefix(
  key: string,
  prefix: string | undefined | null = getR2KeyPrefixFromEnv(),
): string {
  const p = normalizeR2KeyPrefix(prefix);
  if (p && key.startsWith(p)) return key.slice(p.length);
  return key;
}

export function assertValidAccessionId(accessionId: string): void {
  if (!ACCESSION_ID_RE.test(accessionId)) {
    throw new Error(`Invalid accessionId for R2 keys: ${accessionId}`);
  }
}

export function assertValidRevision(revision: number): void {
  if (!Number.isInteger(revision) || revision < 1 || revision > 9999) {
    throw new Error(`Invalid media revision: ${revision}`);
  }
}

function logicalOriginalKey(
  accessionId: string,
  revision: number,
  storedFilename: string,
): string {
  return `archive/${accessionId}/r${revision}/original/${storedFilename}`;
}

function logicalPreparedKey(accessionId: string, revision: number): string {
  return `archive/${accessionId}/r${revision}/prepared/${R2_PREPARED_FILENAME}`;
}

function logicalDerivativeKey(
  accessionId: string,
  revision: number,
  filename: string,
): string {
  return `archive/${accessionId}/r${revision}/derivatives/${filename}`;
}

export function buildOriginalKey(
  accessionId: string,
  revision: number,
  storedFilename: string,
  keyPrefix?: string | null,
): string {
  assertValidAccessionId(accessionId);
  assertValidRevision(revision);
  if (!STORED_ORIGINAL_RE.test(storedFilename)) {
    throw new Error(`Invalid stored original filename: ${storedFilename}`);
  }
  return withR2KeyPrefix(
    logicalOriginalKey(accessionId, revision, storedFilename),
    keyPrefix,
  );
}

export function buildPreparedKey(
  accessionId: string,
  revision: number,
  keyPrefix?: string | null,
): string {
  assertValidAccessionId(accessionId);
  assertValidRevision(revision);
  return withR2KeyPrefix(logicalPreparedKey(accessionId, revision), keyPrefix);
}

export function buildDerivativeKey(
  accessionId: string,
  revision: number,
  filename: string,
  keyPrefix?: string | null,
): string {
  assertValidAccessionId(accessionId);
  assertValidRevision(revision);
  const allowed = Object.values(DERIVATIVE_FILENAMES);
  if (!allowed.includes(filename)) {
    throw new Error(`Invalid derivative filename for R2 key: ${filename}`);
  }
  return withR2KeyPrefix(
    logicalDerivativeKey(accessionId, revision, filename),
    keyPrefix,
  );
}

export function buildAllRevisionKeys(input: {
  accessionId: string;
  revision: number;
  storedFilename: string;
  keyPrefix?: string | null;
}): {
  original: string;
  prepared: string;
  derivatives: Record<keyof typeof DERIVATIVE_FILENAMES, string>;
  all: string[];
} {
  const prefix =
    input.keyPrefix !== undefined
      ? input.keyPrefix
      : getR2KeyPrefixFromEnv();
  const original = buildOriginalKey(
    input.accessionId,
    input.revision,
    input.storedFilename,
    prefix,
  );
  const prepared = buildPreparedKey(
    input.accessionId,
    input.revision,
    prefix,
  );
  const derivatives = {
    artwork: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.artwork,
      prefix,
    ),
    preview: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.preview,
      prefix,
    ),
    previewWebp: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.previewWebp,
      prefix,
    ),
    social: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.social,
      prefix,
    ),
    thumb: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.thumb,
      prefix,
    ),
  };
  return {
    original,
    prepared,
    derivatives,
    all: [original, prepared, ...Object.values(derivatives)],
  };
}

/** True when key is a valid archive media object for the given accession + revision. */
export function isAllowedArchiveObjectKey(
  key: string,
  accessionId: string,
  revision: number,
  keyPrefix?: string | null,
): boolean {
  try {
    assertValidAccessionId(accessionId);
    assertValidRevision(revision);
  } catch {
    return false;
  }

  if (key.includes("..") || key.includes("//")) {
    return false;
  }

  const prefix =
    keyPrefix !== undefined ? keyPrefix : getR2KeyPrefixFromEnv();
  const logical = withoutR2KeyPrefix(key, prefix);
  const expected = `archive/${accessionId}/r${revision}/`;
  if (!logical.startsWith(expected)) {
    return false;
  }

  const rest = logical.slice(expected.length);
  if (rest.startsWith("original/")) {
    return STORED_ORIGINAL_RE.test(rest.slice("original/".length));
  }
  if (rest === `prepared/${R2_PREPARED_FILENAME}`) {
    return true;
  }
  if (rest.startsWith("derivatives/")) {
    const filename = rest.slice("derivatives/".length);
    return Object.values(DERIVATIVE_FILENAMES).includes(filename);
  }
  return false;
}

export function parseAccessionRevisionFromKey(
  key: string,
  keyPrefix?: string | null,
): { accessionId: string; revision: number } | null {
  const prefix =
    keyPrefix !== undefined ? keyPrefix : getR2KeyPrefixFromEnv();
  const logical = withoutR2KeyPrefix(key, prefix);
  const match = LOGICAL_KEY_RE.exec(logical);
  if (!match) return null;
  return { accessionId: match[1], revision: Number(match[2]) };
}

export { DERIVATIVE_FILENAMES };
