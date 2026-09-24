/**
 * Pure readiness gates for Prepare / Update & Publish.
 * Keep in sync with EmbeddedPreparePanel + IngestionWizard.
 */

export function canPrepareWorkingMaster(input: {
  hasDraft: boolean;
  hasSourceFile: boolean;
  sourceHydrating?: boolean;
  preparing?: boolean;
}): boolean {
  return (
    input.hasDraft &&
    input.hasSourceFile &&
    !input.sourceHydrating &&
    !input.preparing
  );
}

/** Update & Publish requires both hydrated/selected original and local prepared. */
export function canUpdateAndPublish(input: {
  hasSourceFile: boolean;
  hasPreparedLocal: boolean;
}): boolean {
  return input.hasSourceFile && input.hasPreparedLocal;
}
