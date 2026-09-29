"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getTransientObjectUrl,
  getTransientUpload,
  registerTransientUpload,
  revokeTransientUpload,
} from "@/lib/archive/transient-upload-registry";
import { clearPrepareSession } from "@/lib/export-engine/session";
import { blobToDataUrl } from "@/lib/image-processing/bytes";
import {
  createInitialWorkspaceState,
  preparedIsValid,
  resolvedArtwork,
  workspaceReducer,
  type WorkspaceAction,
} from "./reducer";
import {
  clearWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from "./snapshot";
import {
  ensurePrepared,
  type PreparedExportBundle,
} from "./ensure-prepared";
import {
  createIndexedDbBackend,
  type WorkspacePersistenceBackend,
} from "./persistence-backend";
import {
  NO_STORED_BLOBS,
  clearLegacyAfterPersist,
  loadPersistedWorkspace,
  persistPreparedBlobs,
  persistWorkspaceMetadata,
  replaceSourceBlob,
  resolveHydration,
  type PersistResult,
  type StoredBlobFlags,
} from "./persistence";
import type {
  PattaraiWorkspaceRuntime,
  WorkspacePersistenceState,
} from "./types";

type WorkspaceContextValue = {
  state: PattaraiWorkspaceRuntime;
  dispatch: (action: WorkspaceAction) => void;
  resolved: ReturnType<typeof resolvedArtwork>;
  isPreparedValid: boolean;
  persistence: WorkspacePersistenceState;
  importFile: (file: File) => void;
  clearSource: () => void;
  ensurePrepared: () => Promise<boolean>;
  ensurePreparedBundle: () => Promise<PreparedExportBundle | null>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const METADATA_DEBOUNCE_MS = 800;

const UNAVAILABLE_MESSAGE =
  "Browser storage is unavailable. Work is kept in this tab only and the image must be re-imported after a reload.";
const QUOTA_MESSAGE =
  "Browser storage is full. Work is kept in this tab, but the image may need re-importing after a reload.";
const WRITE_ERROR_MESSAGE =
  "Some work could not be saved to this browser. It is kept in this tab for now.";

type StoredBlobsTracker = {
  workspaceId: string;
  flags: StoredBlobFlags;
  preparedFingerprint: string | null;
};

let sharedBackend: WorkspacePersistenceBackend | null | undefined;
let pendingWrite: Promise<unknown> = Promise.resolve();

function getBackend(): WorkspacePersistenceBackend | null {
  if (sharedBackend === undefined) {
    try {
      sharedBackend = createIndexedDbBackend();
    } catch {
      sharedBackend = null;
    }
  }
  return sharedBackend;
}

function queueWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = pendingWrite.then(task, task);
  pendingWrite = next.catch(() => undefined);
  return next;
}

/** Reuse the registry URL when it already holds this exact file (same-tab remount). */
function adoptRestoredObjectUrl(workspaceId: string, file: File): string {
  const existing = getTransientUpload(workspaceId);
  if (existing) {
    const same =
      existing.file.name === file.name &&
      existing.file.size === file.size &&
      existing.file.lastModified === file.lastModified;
    return same ? existing.objectUrl : URL.createObjectURL(file);
  }
  return registerTransientUpload(workspaceId, file).objectUrl;
}

function readInitialState(): PattaraiWorkspaceRuntime {
  if (typeof window === "undefined") {
    return createInitialWorkspaceState(null);
  }
  return createInitialWorkspaceState(loadWorkspaceSnapshot());
}

export function PerceiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(
    workspaceReducer,
    undefined,
    readInitialState,
  );
  const [persistence, setPersistence] = useState<WorkspacePersistenceState>({
    status: "restoring",
    restoredSource: false,
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const mutationCountRef = useRef(0);
  const hydratedRef = useRef(false);
  const legacyClearedRef = useRef(false);
  const storedBlobsRef = useRef<StoredBlobsTracker>({
    workspaceId: "",
    flags: { ...NO_STORED_BLOBS },
    preparedFingerprint: null,
  });

  const dispatch = useCallback((action: WorkspaceAction) => {
    mutationCountRef.current += 1;
    rawDispatch(action);
  }, []);

  const reportFailure = useCallback((result: PersistResult) => {
    if (result.ok) return;
    const message = result.reason === "quota" ? QUOTA_MESSAGE : WRITE_ERROR_MESSAGE;
    setPersistence((prev) =>
      prev.status === "unavailable" ||
      (prev.status === "degraded" && prev.message === message)
        ? prev
        : { ...prev, status: "degraded", message },
    );
  }, []);

  const flushMetadata = useCallback(() => {
    if (!hydratedRef.current) return;
    const snapshotState = stateRef.current;
    saveWorkspaceSnapshot(snapshotState);
    const backend = getBackend();
    if (!backend) return;
    const tracker = storedBlobsRef.current;
    const flags =
      tracker.workspaceId === snapshotState.workspaceId
        ? tracker.flags
        : NO_STORED_BLOBS;
    void queueWrite(() =>
      persistWorkspaceMetadata(snapshotState, backend, flags),
    ).then((result) => {
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      if (!legacyClearedRef.current) {
        legacyClearedRef.current = clearLegacyAfterPersist(result);
      }
    });
  }, [reportFailure]);

  // Same-tab remount: rebind the preview URL from the registry before IndexedDB answers.
  useEffect(() => {
    const key = stateRef.current.source?.registryKey;
    if (!key) return;
    const url = getTransientObjectUrl(key);
    if (url) {
      rawDispatch({ type: "HYDRATE_SOURCE_URL", objectUrl: url });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const backend = getBackend();
    const startCount = mutationCountRef.current;
    pendingWrite
      .then(() => {
        if (!backend) throw new Error("IndexedDB unavailable");
        return loadPersistedWorkspace(backend, {
          createObjectUrl: adoptRestoredObjectUrl,
          blobToDataUrl,
        });
      })
      .then((loaded) => {
        if (cancelled) return;
        hydratedRef.current = true;
        if (!loaded) {
          setPersistence({ status: "ready", restoredSource: false });
          return;
        }
        const current = stateRef.current;
        const next = resolveHydration(
          current,
          loaded,
          mutationCountRef.current !== startCount,
        );
        if (!next) {
          const restoredUrl = loaded.state.source?.objectUrl;
          const restoredId = loaded.state.workspaceId;
          if (restoredUrl) {
            const registryUrl = getTransientObjectUrl(restoredId);
            if (registryUrl !== restoredUrl) {
              URL.revokeObjectURL(restoredUrl);
            } else if (restoredId !== current.workspaceId) {
              revokeTransientUpload(restoredId);
            }
          }
          setPersistence({ status: "ready", restoredSource: false });
          return;
        }
        storedBlobsRef.current = {
          workspaceId: next.workspaceId,
          flags: { ...loaded.blobs },
          preparedFingerprint:
            next.preparation.status === "ready" ? next.preparation.fingerprint : null,
        };
        rawDispatch({ type: "HYDRATE_FROM_PERSISTENCE", state: next });
        setPersistence({
          status: "ready",
          restoredSource: Boolean(next.source?.objectUrl) && loaded.restoredSource,
        });
      })
      .catch(() => {
        if (cancelled) return;
        hydratedRef.current = true;
        sharedBackend = null;
        setPersistence({
          status: "unavailable",
          restoredSource: false,
          message: UNAVAILABLE_MESSAGE,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Deliberate, debounced metadata + sessionStorage snapshot writes.
  useEffect(() => {
    if (persistence.status === "restoring") return;
    const timer = window.setTimeout(flushMetadata, METADATA_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state, persistence.status, flushMetadata]);

  useEffect(() => {
    const onPageHide = () => flushMetadata();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushMetadata();
    };
  }, [flushMetadata]);

  // Prepared binaries are written once per new ready fingerprint.
  useEffect(() => {
    if (persistence.status === "restoring") return;
    const backend = getBackend();
    if (!backend) return;
    const prep = state.preparation;
    if (prep.status !== "ready" || !prep.fingerprint || !prep.preparedAvif) return;

    const workspaceId = state.workspaceId;
    const fingerprint = prep.fingerprint;
    const tracker = storedBlobsRef.current;
    if (tracker.workspaceId === workspaceId && tracker.preparedFingerprint === fingerprint) {
      return;
    }
    const baseFlags =
      tracker.workspaceId === workspaceId ? tracker.flags : NO_STORED_BLOBS;
    storedBlobsRef.current = {
      workspaceId,
      flags: { ...baseFlags, avif: false, webp: false },
      preparedFingerprint: fingerprint,
    };

    const avif = prep.preparedAvif;
    const webp = prep.preparedWebp;
    void queueWrite(() =>
      persistPreparedBlobs(workspaceId, avif, webp, backend),
    ).then((outcome) => {
      const latest = storedBlobsRef.current;
      if (latest.workspaceId !== workspaceId || latest.preparedFingerprint !== fingerprint) {
        return;
      }
      storedBlobsRef.current = {
        ...latest,
        flags: { ...latest.flags, avif: outcome.avif, webp: outcome.webp },
      };
      reportFailure(outcome.result);
      flushMetadata();
    });
  }, [
    state.preparation,
    state.workspaceId,
    persistence.status,
    flushMetadata,
    reportFailure,
  ]);

  const importFile = useCallback(
    (file: File) => {
      const workspaceId = stateRef.current.workspaceId;
      const entry = registerTransientUpload(workspaceId, file);
      dispatch({
        type: "IMPORT_SOURCE",
        source: {
          registryKey: workspaceId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
          lastModified: file.lastModified,
          objectUrl: entry.objectUrl,
        },
        fileNameForTitle: file.name,
      });
      setPersistence((prev) =>
        prev.restoredSource ? { ...prev, restoredSource: false } : prev,
      );

      storedBlobsRef.current = {
        workspaceId,
        flags: { ...NO_STORED_BLOBS },
        preparedFingerprint: null,
      };
      const backend = getBackend();
      if (!backend) return;
      void queueWrite(() => replaceSourceBlob(workspaceId, file, backend)).then(
        (result) => {
          const latest = storedBlobsRef.current;
          if (latest.workspaceId !== workspaceId) return;
          if (!result.ok) {
            reportFailure(result);
            return;
          }
          storedBlobsRef.current = {
            ...latest,
            flags: { ...latest.flags, source: true },
          };
          flushMetadata();
        },
      );
    },
    [dispatch, flushMetadata, reportFailure],
  );

  const clearSource = useCallback(() => {
    const key =
      stateRef.current.source?.registryKey ?? stateRef.current.workspaceId;
    revokeTransientUpload(key);
    clearWorkspaceSnapshot();
    clearPrepareSession();
    storedBlobsRef.current = {
      workspaceId: "",
      flags: { ...NO_STORED_BLOBS },
      preparedFingerprint: null,
    };
    const backend = getBackend();
    if (backend) {
      void queueWrite(() => backend.clearAll()).catch(() => undefined);
    }
    setPersistence((prev) =>
      prev.restoredSource ? { ...prev, restoredSource: false } : prev,
    );
    dispatch({ type: "CLEAR_SOURCE" });
  }, [dispatch]);

  const runEnsurePrepared = useCallback(async () => {
    const bundle = await ensurePrepared(() => stateRef.current, dispatch);
    return bundle !== null;
  }, [dispatch]);

  const ensurePreparedBundle = useCallback(async () => {
    return ensurePrepared(() => stateRef.current, dispatch);
  }, [dispatch]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      dispatch,
      resolved: resolvedArtwork(state),
      isPreparedValid: preparedIsValid(state),
      persistence,
      importFile,
      clearSource,
      ensurePrepared: runEnsurePrepared,
      ensurePreparedBundle,
    }),
    [
      state,
      dispatch,
      persistence,
      importFile,
      clearSource,
      runEnsurePrepared,
      ensurePreparedBundle,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function usePerceiveWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      "usePerceiveWorkspace must be used within PerceiveWorkspaceProvider",
    );
  }
  return ctx;
}

export function usePerceiveWorkspaceOptional(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
