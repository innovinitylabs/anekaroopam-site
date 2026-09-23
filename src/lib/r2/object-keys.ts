/**
 * Deterministic R2 object key builders and validators.
 * Keys never include browser-local draft ids.
 */

import { ARCHIVE_IMAGE_OUTPUTS } from "@/lib/archive/image-specs";

const ACCESSION_ID_RE = /^AR-\d{4}-\d{4}$/;
const STORED_ORIGINAL_RE = /^original\.[a-z0-9]+$/;

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

export function buildOriginalKey(
  accessionId: string,
  revision: number,
  storedFilename: string,
): string {
  assertValidAccessionId(accessionId);
  assertValidRevision(revision);
  if (!STORED_ORIGINAL_RE.test(storedFilename)) {
    throw new Error(`Invalid stored original filename: ${storedFilename}`);
  }
  return `archive/${accessionId}/r${revision}/original/${storedFilename}`;
}

export function buildPreparedKey(accessionId: string, revision: number): string {
  assertValidAccessionId(accessionId);
  assertValidRevision(revision);
  return `archive/${accessionId}/r${revision}/prepared/${R2_PREPARED_FILENAME}`;
}

export function buildDerivativeKey(
  accessionId: string,
  revision: number,
  filename: string,
): string {
  assertValidAccessionId(accessionId);
  assertValidRevision(revision);
  const allowed = Object.values(DERIVATIVE_FILENAMES);
  if (!allowed.includes(filename)) {
    throw new Error(`Invalid derivative filename for R2 key: ${filename}`);
  }
  return `archive/${accessionId}/r${revision}/derivatives/${filename}`;
}

export function buildAllRevisionKeys(input: {
  accessionId: string;
  revision: number;
  storedFilename: string;
}): {
  original: string;
  prepared: string;
  derivatives: Record<keyof typeof DERIVATIVE_FILENAMES, string>;
  all: string[];
} {
  const original = buildOriginalKey(
    input.accessionId,
    input.revision,
    input.storedFilename,
  );
  const prepared = buildPreparedKey(input.accessionId, input.revision);
  const derivatives = {
    artwork: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.artwork,
    ),
    preview: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.preview,
    ),
    previewWebp: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.previewWebp,
    ),
    social: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.social,
    ),
    thumb: buildDerivativeKey(
      input.accessionId,
      input.revision,
      DERIVATIVE_FILENAMES.thumb,
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
): boolean {
  try {
    assertValidAccessionId(accessionId);
    assertValidRevision(revision);
  } catch {
    return false;
  }

  const prefix = `archive/${accessionId}/r${revision}/`;
  if (!key.startsWith(prefix) || key.includes("..") || key.includes("//")) {
    return false;
  }

  const rest = key.slice(prefix.length);
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
): { accessionId: string; revision: number } | null {
  const match = /^archive\/(AR-\d{4}-\d{4})\/r(\d+)\//.exec(key);
  if (!match) return null;
  return { accessionId: match[1], revision: Number(match[2]) };
}

export { DERIVATIVE_FILENAMES };
