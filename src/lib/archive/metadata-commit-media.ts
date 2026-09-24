/**
 * Pure validation for metadata-commit media refs (no R2 I/O).
 */

import { isAllowedArchiveObjectKey } from "@/lib/r2/object-keys";

export interface MetadataCommitMediaObjectInput {
  key: string;
  contentType: string;
  contentLength: number;
}

export interface ValidatedMetadataCommitMedia {
  accessionId: string;
  revision: number;
  objects: MetadataCommitMediaObjectInput[];
}

export function validateMetadataCommitMedia(input: {
  accessionId?: string;
  revision?: number;
  objects?: MetadataCommitMediaObjectInput[];
}):
  | { ok: true; media: ValidatedMetadataCommitMedia }
  | { ok: false; error: string } {
  const accessionId = String(input.accessionId ?? "").trim();
  const revision = Number(input.revision);
  const objects = input.objects ?? [];

  if (!accessionId || !Number.isInteger(revision) || revision < 1) {
    return {
      ok: false,
      error:
        "media.accessionId and media.revision are required for metadata-commit",
    };
  }

  if (objects.length < 1 || objects.length > 16) {
    return {
      ok: false,
      error: "media.objects must contain 1–16 verified R2 object refs",
    };
  }

  for (const obj of objects) {
    if (!obj.key || !obj.contentType || !Number.isFinite(obj.contentLength)) {
      return {
        ok: false,
        error:
          "Each media object requires key, contentType, and contentLength",
      };
    }
    if (obj.contentLength < 1) {
      return {
        ok: false,
        error: `Invalid contentLength for ${obj.key}`,
      };
    }
    if (!isAllowedArchiveObjectKey(obj.key, accessionId, revision)) {
      return {
        ok: false,
        error: `Unauthorized object key for metadata-commit: ${obj.key}`,
      };
    }
  }

  return {
    ok: true,
    media: { accessionId, revision, objects },
  };
}
