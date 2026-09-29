export type {
  PattaraiWorkspaceRuntime,
  PattaraiWorkspaceSnapshot,
  PreparationStatus,
  ExportStatus,
  WorkspaceSource,
  WorkspacePreparation,
  WorkspaceExport,
  PersistedWorkspaceRecord,
  PersistedBlob,
  PersistedBlobKind,
  PreparedBlobMeta,
  WorkspacePersistenceStatus,
  WorkspacePersistenceState,
} from "./types";
export {
  PATTARAI_WORKSPACE_SNAPSHOT_KEY,
  PATTARAI_RECORD_SCHEMA_VERSION,
} from "./types";
export {
  createIndexedDbBackend,
  createMemoryBackend,
  type WorkspacePersistenceBackend,
} from "./persistence-backend";
export {
  loadPersistedWorkspace,
  persistWorkspaceMetadata,
  persistWorkspaceBlob,
  persistPreparedBlobs,
  replaceSourceBlob,
  resolveHydration,
  type LoadedWorkspace,
  type PersistResult,
} from "./persistence";
export {
  computePreparationFingerprint,
  isPreparedValid,
  profileNeedsWebp,
  stableConversionOptionsJson,
} from "./fingerprint";
export {
  createInitialWorkspaceState,
  createEmptyArtwork,
  expectedFingerprint,
  preparedIsValid,
  resolvedArtwork,
  workspaceReducer,
  type WorkspaceAction,
} from "./reducer";
export {
  toWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  clearWorkspaceSnapshot,
} from "./snapshot";
export { ensurePrepared, type PreparedExportBundle } from "./ensure-prepared";
export {
  PerceiveWorkspaceProvider,
  usePerceiveWorkspace,
  usePerceiveWorkspaceOptional,
} from "./PerceiveWorkspaceProvider";
