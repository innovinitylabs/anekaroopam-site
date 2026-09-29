import { clearPrepareSession } from "@/lib/export-engine/session";
import type { ConversionResult } from "@/lib/image-processing/types";
import {
  createInitialWorkspaceState,
  expectedFingerprint,
  preparedIsValid,
} from "./reducer";
import { toWorkspaceSnapshot } from "./snapshot";
import type { WorkspacePersistenceBackend } from "./persistence-backend";
import {
  PATTARAI_RECORD_SCHEMA_VERSION,
  type PattaraiWorkspaceRuntime,
  type PersistedBlob,
  type PersistedBlobKind,
  type PersistedWorkspaceRecord,
  type PreparedBlobMeta,
} from "./types";

export type PersistResult =
  | { ok: true }
  | { ok: false; reason: "quota" | "error"; message: string };

export type StoredBlobFlags = Record<PersistedBlobKind, boolean>;

export const NO_STORED_BLOBS: StoredBlobFlags = Object.freeze({
  source: false,
  avif: false,
  webp: false,
});

export type LoadedWorkspace = {
  state: PattaraiWorkspaceRuntime;
  sourceFile: File | null;
  restoredSource: boolean;
  restoredPrepared: boolean;
  /** Blobs that were found in storage and passed validation. */
  blobs: StoredBlobFlags;
};

export type LoadDeps = {
  createObjectUrl: (workspaceId: string, file: File) => string;
  blobToDataUrl: (blob: Blob) => Promise<string>;
};

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
}

function failure(err: unknown): PersistResult {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, reason: isQuotaError(err) ? "quota" : "error", message };
}

export function toPreparedBlobMeta(result: ConversionResult): PreparedBlobMeta {
  const meta: PreparedBlobMeta = {
    stats: { ...result.stats },
    format: result.format,
    compressionRatio: result.compressionRatio,
    processingMs: result.processingMs,
  };
  if (result.requestedFormat !== undefined) meta.requestedFormat = result.requestedFormat;
  if (result.encodedWithWasm !== undefined) meta.encodedWithWasm = result.encodedWithWasm;
  return meta;
}

/**
 * Build the metadata record. Prepared metadata is only included when the
 * runtime is ready and the matching AVIF blob is known to be stored.
 */
export function buildWorkspaceRecord(
  state: PattaraiWorkspaceRuntime,
  blobs: StoredBlobFlags,
): PersistedWorkspaceRecord {
  const prep = state.preparation;
  const hasPrepared =
    prep.status === "ready" &&
    Boolean(prep.fingerprint) &&
    prep.preparedAvif !== null &&
    blobs.avif;
  return {
    schemaVersion: PATTARAI_RECORD_SCHEMA_VERSION,
    workspaceId: state.workspaceId,
    updatedAt: new Date().toISOString(),
    snapshot: toWorkspaceSnapshot(state),
    blobs: { ...blobs },
    prepared:
      hasPrepared && prep.preparedAvif && prep.fingerprint
        ? {
            fingerprint: prep.fingerprint,
            avif: toPreparedBlobMeta(prep.preparedAvif),
            webp:
              prep.preparedWebp && blobs.webp
                ? toPreparedBlobMeta(prep.preparedWebp)
                : null,
          }
        : null,
  };
}

/** Writes the metadata record only. Never touches blobs. */
export async function persistWorkspaceMetadata(
  state: PattaraiWorkspaceRuntime,
  backend: WorkspacePersistenceBackend,
  blobs: StoredBlobFlags,
): Promise<PersistResult> {
  try {
    await backend.putRecord(buildWorkspaceRecord(state, blobs));
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

/** Writes one binary. Quota errors are reported, not thrown. */
export async function persistWorkspaceBlob(
  kind: PersistedBlobKind,
  blob: Blob,
  meta: { workspaceId: string; fileName?: string; mimeType?: string; lastModified?: number },
  backend: WorkspacePersistenceBackend,
): Promise<PersistResult> {
  const entry: PersistedBlob = {
    workspaceId: meta.workspaceId,
    kind,
    blob,
    mimeType: meta.mimeType || blob.type || "application/octet-stream",
  };
  if (meta.fileName !== undefined) entry.fileName = meta.fileName;
  if (meta.lastModified !== undefined) entry.lastModified = meta.lastModified;
  try {
    await backend.putBlob(entry);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

/** New source replaces old: stale prepared blobs are removed first. */
export async function replaceSourceBlob(
  workspaceId: string,
  file: File,
  backend: WorkspacePersistenceBackend,
): Promise<PersistResult> {
  try {
    await backend.deleteBlob("avif");
    await backend.deleteBlob("webp");
  } catch (err) {
    return failure(err);
  }
  return persistWorkspaceBlob(
    "source",
    file,
    {
      workspaceId,
      fileName: file.name,
      mimeType: file.type,
      lastModified: file.lastModified,
    },
    backend,
  );
}

/** Writes the prepared AVIF (and WebP when present; otherwise removes any old WebP). */
export async function persistPreparedBlobs(
  workspaceId: string,
  avif: ConversionResult,
  webp: ConversionResult | null,
  backend: WorkspacePersistenceBackend,
): Promise<{ result: PersistResult; avif: boolean; webp: boolean }> {
  const avifResult = await persistWorkspaceBlob(
    "avif",
    avif.blob,
    { workspaceId, mimeType: avif.stats.mimeType },
    backend,
  );
  if (!avifResult.ok) return { result: avifResult, avif: false, webp: false };

  if (!webp) {
    try {
      await backend.deleteBlob("webp");
    } catch {
      /* stale webp is ignored on load when record.prepared.webp is null */
    }
    return { result: avifResult, avif: true, webp: false };
  }

  const webpResult = await persistWorkspaceBlob(
    "webp",
    webp.blob,
    { workspaceId, mimeType: webp.stats.mimeType },
    backend,
  );
  return { result: webpResult, avif: true, webp: webpResult.ok };
}

/** Removes the legacy prepare-session key once IndexedDB holds the workspace. */
export function clearLegacyAfterPersist(result: PersistResult): boolean {
  if (!result.ok) return false;
  clearPrepareSession();
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPreparedMeta(value: unknown): value is PreparedBlobMeta {
  if (!isObject(value) || !isObject(value.stats)) return false;
  return (
    typeof value.format === "string" &&
    typeof value.stats.byteSize === "number" &&
    typeof value.stats.mimeType === "string"
  );
}

export function isValidWorkspaceRecord(raw: unknown): raw is PersistedWorkspaceRecord {
  if (!isObject(raw)) return false;
  if (raw.schemaVersion !== PATTARAI_RECORD_SCHEMA_VERSION) return false;
  if (typeof raw.workspaceId !== "string" || !raw.workspaceId) return false;

  const snap = raw.snapshot;
  if (!isObject(snap) || snap.version !== 1) return false;
  if (snap.workspaceId !== raw.workspaceId) return false;
  if (!isObject(snap.artwork) || !Array.isArray(snap.artwork.states)) return false;
  if (!isObject(snap.preparation) || !isObject(snap.preparation.options)) return false;
  if (!isObject(snap.export)) return false;
  if (snap.export.profile !== "compatible" && snap.export.profile !== "onchain") {
    return false;
  }
  if (snap.source !== null && !isObject(snap.source)) return false;

  const blobs = raw.blobs;
  if (
    !isObject(blobs) ||
    typeof blobs.source !== "boolean" ||
    typeof blobs.avif !== "boolean" ||
    typeof blobs.webp !== "boolean"
  ) {
    return false;
  }

  if (raw.prepared !== null) {
    const p = raw.prepared;
    if (!isObject(p) || typeof p.fingerprint !== "string") return false;
    if (!isPreparedMeta(p.avif)) return false;
    if (p.webp !== null && !isPreparedMeta(p.webp)) return false;
  }
  return true;
}

function isBlobEntry(
  raw: unknown,
  kind: PersistedBlobKind,
  workspaceId: string,
): raw is PersistedBlob {
  return (
    isObject(raw) &&
    raw.kind === kind &&
    raw.workspaceId === workspaceId &&
    raw.blob instanceof Blob
  );
}

async function readBlob(
  backend: WorkspacePersistenceBackend,
  kind: PersistedBlobKind,
  workspaceId: string,
): Promise<PersistedBlob | null> {
  try {
    const raw = await backend.getBlob(kind);
    return isBlobEntry(raw, kind, workspaceId) ? raw : null;
  } catch {
    return null;
  }
}

async function rebuildConversion(
  entry: PersistedBlob,
  meta: PreparedBlobMeta,
  deps: LoadDeps,
): Promise<ConversionResult | null> {
  if (entry.blob.size !== meta.stats.byteSize) return null;
  try {
    const dataUrl = await deps.blobToDataUrl(entry.blob);
    return { ...meta, stats: { ...meta.stats }, blob: entry.blob, dataUrl };
  } catch {
    return null;
  }
}

/**
 * Load and validate the persisted workspace. Returns null when nothing is
 * stored, or when the record is corrupt/incompatible (storage is then cleared).
 * Backend read failures on the record propagate so callers can fall back.
 */
export async function loadPersistedWorkspace(
  backend: WorkspacePersistenceBackend,
  deps: LoadDeps,
): Promise<LoadedWorkspace | null> {
  const raw = await backend.getRecord();
  if (raw === null || raw === undefined) return null;
  if (!isValidWorkspaceRecord(raw)) {
    try {
      await backend.clearAll();
    } catch {
      /* best effort */
    }
    return null;
  }

  const record = raw;
  const base = createInitialWorkspaceState(record.snapshot);
  const blobs: StoredBlobFlags = { ...NO_STORED_BLOBS };
  let sourceFile: File | null = null;
  let state: PattaraiWorkspaceRuntime = {
    ...base,
    preparation: {
      ...base.preparation,
      fingerprint: null,
      status:
        record.snapshot.source && record.snapshot.preparation.status === "stale"
          ? "stale"
          : "idle",
    },
  };

  const snapSource = record.snapshot.source;
  if (snapSource && record.blobs.source && state.source) {
    const entry = await readBlob(backend, "source", record.workspaceId);
    const sizeMatches =
      entry !== null &&
      (snapSource.byteSize === undefined || entry.blob.size === snapSource.byteSize);
    if (entry && sizeMatches) {
      sourceFile = new File(
        [entry.blob],
        entry.fileName ?? snapSource.fileName ?? "source",
        {
          type: entry.mimeType,
          lastModified: entry.lastModified ?? snapSource.lastModified ?? Date.now(),
        },
      );
      const objectUrl = deps.createObjectUrl(record.workspaceId, sourceFile);
      blobs.source = true;
      state = {
        ...state,
        source: { ...state.source, objectUrl },
        artwork: { ...state.artwork, imageSrc: objectUrl },
      };
    }
  }

  let restoredPrepared = false;
  if (sourceFile && record.prepared) {
    const prepared = record.prepared;
    if (expectedFingerprint(state) === prepared.fingerprint) {
      const avifEntry = await readBlob(backend, "avif", record.workspaceId);
      const avif = avifEntry
        ? await rebuildConversion(avifEntry, prepared.avif, deps)
        : null;
      let webp: ConversionResult | null = null;
      if (avif && prepared.webp) {
        const webpEntry = await readBlob(backend, "webp", record.workspaceId);
        webp = webpEntry
          ? await rebuildConversion(webpEntry, prepared.webp, deps)
          : null;
      }
      if (avif) {
        const candidate: PattaraiWorkspaceRuntime = {
          ...state,
          preparation: {
            ...state.preparation,
            preparedAvif: avif,
            preparedWebp: webp,
            fingerprint: prepared.fingerprint,
            status: "ready",
          },
        };
        if (preparedIsValid(candidate)) {
          state = candidate;
          restoredPrepared = true;
          blobs.avif = true;
          blobs.webp = webp !== null;
        }
      }
    }
    if (!restoredPrepared) {
      state = {
        ...state,
        preparation: { ...state.preparation, status: "stale" },
      };
    }
  }

  return {
    state,
    sourceFile,
    restoredSource: sourceFile !== null,
    restoredPrepared,
    blobs,
  };
}

/**
 * Stale-async guard. With no user mutations since the load began, the loaded
 * state wins. Otherwise only binaries are attached, and only to the same
 * workspace while it still lacks a source preview. Artwork, options and
 * profile edited by the user are never overwritten. Returns null when
 * nothing should be applied.
 */
export function resolveHydration(
  current: PattaraiWorkspaceRuntime,
  loaded: LoadedWorkspace,
  mutatedSinceStart: boolean,
): PattaraiWorkspaceRuntime | null {
  if (!mutatedSinceStart) return loaded.state;

  const restored = loaded.state.source;
  if (!loaded.restoredSource || !restored?.objectUrl) return null;
  if (loaded.state.workspaceId !== current.workspaceId) return null;
  if (!current.source || current.source.objectUrl) return null;
  if (
    current.source.fileName !== restored.fileName ||
    current.source.byteSize !== restored.byteSize ||
    current.source.lastModified !== restored.lastModified
  ) {
    return null;
  }

  const objectUrl = restored.objectUrl;
  let next: PattaraiWorkspaceRuntime = {
    ...current,
    source: { ...current.source, objectUrl },
    artwork: { ...current.artwork, imageSrc: objectUrl },
  };

  const lp = loaded.state.preparation;
  if (
    loaded.restoredPrepared &&
    lp.preparedAvif &&
    !current.preparation.preparedAvif &&
    lp.fingerprint === expectedFingerprint(next)
  ) {
    const candidate: PattaraiWorkspaceRuntime = {
      ...next,
      preparation: {
        ...next.preparation,
        preparedAvif: lp.preparedAvif,
        preparedWebp: lp.preparedWebp,
        fingerprint: lp.fingerprint,
        status: "ready",
        error: null,
      },
    };
    if (preparedIsValid(candidate)) next = candidate;
  }
  return next;
}
