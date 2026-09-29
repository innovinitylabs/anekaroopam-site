/**
 * Decide whether upload-auth may presign a PUT onto a key that already exists in R2.
 * Pure (no R2/Worker I/O) so the rules are unit-testable.
 */

export type OwnedAssetRef = { object_key: string; revision: number };

export type OverwriteDecision = { ok: true } | { ok: false; error: string };

export function decideExistingObjectOverwrite(input: {
  key: string;
  existingSize: number | undefined;
  incomingSize: number;
  workingRevision: number;
  /** D1 memberships for this artwork; null in legacy (non-Worker) mode. */
  ownedAssets: OwnedAssetRef[] | null;
  retrySameRevision: boolean;
}): OverwriteDecision {
  const sameSize = input.existingSize === input.incomingSize;

  if (input.ownedAssets === null) {
    if (sameSize || input.retrySameRevision) return { ok: true };
    return {
      ok: false,
      error: `Object already exists and size differs: ${input.key}. Use a new revision or retrySameRevision after a partial failure.`,
    };
  }

  const memberships = input.ownedAssets.filter(
    (asset) => asset.object_key === input.key,
  );
  const frozen = memberships.find(
    (asset) => asset.revision !== input.workingRevision,
  );
  if (frozen) {
    return {
      ok: false,
      error: `Object is referenced by frozen revision r${frozen.revision} and cannot be overwritten: ${input.key}`,
    };
  }

  if (memberships.length > 0) {
    if (sameSize || input.retrySameRevision) return { ok: true };
    return {
      ok: false,
      error: `Object already exists for this working revision and size differs: ${input.key}. Retry with retrySameRevision to replace it.`,
    };
  }

  // Not registered to this artwork: only a same-size partial-failure retry is allowed.
  if (sameSize) return { ok: true };
  return {
    ok: false,
    error: `Object already exists and is not registered to this artwork: ${input.key}. Refusing to overwrite.`,
  };
}
