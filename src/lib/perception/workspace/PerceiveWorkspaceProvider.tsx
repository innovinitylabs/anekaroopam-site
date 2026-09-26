"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  getTransientObjectUrl,
  registerTransientUpload,
  revokeTransientUpload,
} from "@/lib/archive/transient-upload-registry";
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
import type { PattaraiWorkspaceRuntime } from "./types";

type WorkspaceContextValue = {
  state: PattaraiWorkspaceRuntime;
  dispatch: (action: WorkspaceAction) => void;
  resolved: ReturnType<typeof resolvedArtwork>;
  isPreparedValid: boolean;
  importFile: (file: File) => void;
  clearSource: () => void;
  ensurePrepared: () => Promise<boolean>;
  ensurePreparedBundle: () => Promise<PreparedExportBundle | null>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readInitialState(): PattaraiWorkspaceRuntime {
  if (typeof window === "undefined") {
    return createInitialWorkspaceState(null);
  }
  return createInitialWorkspaceState(loadWorkspaceSnapshot());
}

export function PerceiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    readInitialState,
  );

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Rebind object URL from registry after snapshot hydrate (same-tab SPA)
  useEffect(() => {
    const key = stateRef.current.source?.registryKey;
    if (!key) return;
    const url = getTransientObjectUrl(key);
    if (url) {
      dispatch({ type: "HYDRATE_SOURCE_URL", objectUrl: url });
    }
  }, []);

  useEffect(() => {
    saveWorkspaceSnapshot(state);
  }, [state]);

  const importFile = useCallback((file: File) => {
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
  }, []);

  const clearSource = useCallback(() => {
    const key =
      stateRef.current.source?.registryKey ?? stateRef.current.workspaceId;
    revokeTransientUpload(key);
    clearWorkspaceSnapshot();
    dispatch({ type: "CLEAR_SOURCE" });
  }, []);

  const runEnsurePrepared = useCallback(async () => {
    const bundle = await ensurePrepared(() => stateRef.current, dispatch);
    return bundle !== null;
  }, []);

  const ensurePreparedBundle = useCallback(async () => {
    return ensurePrepared(() => stateRef.current, dispatch);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      dispatch,
      resolved: resolvedArtwork(state),
      isPreparedValid: preparedIsValid(state),
      importFile,
      clearSource,
      ensurePrepared: runEnsurePrepared,
      ensurePreparedBundle,
    }),
    [state, importFile, clearSource, runEnsurePrepared, ensurePreparedBundle],
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
