import { stripArtworkForStorage } from "@/lib/export-engine/session-artwork";
import { loadPrepareSession } from "@/lib/export-engine/session";
import type {
  PattaraiWorkspaceRuntime,
  PattaraiWorkspaceSnapshot,
} from "./types";
import { PATTARAI_WORKSPACE_SNAPSHOT_KEY } from "./types";

export function toWorkspaceSnapshot(
  state: PattaraiWorkspaceRuntime,
): PattaraiWorkspaceSnapshot {
  return {
    version: 1,
    workspaceId: state.workspaceId,
    artwork: stripArtworkForStorage(state.artwork),
    customBackground: state.customBackground,
    source: state.source
      ? {
          registryKey: state.source.registryKey,
          fileName: state.source.fileName,
          mimeType: state.source.mimeType,
          byteSize: state.source.byteSize,
          lastModified: state.source.lastModified,
        }
      : null,
    preparation: {
      options: state.preparation.options,
      presetId: state.preparation.presetId,
      status: state.preparation.status === "ready" ? "stale" : state.preparation.status,
      fingerprint: state.preparation.fingerprint,
    },
    export: {
      profile: state.export.profile,
    },
    savedAt: new Date().toISOString(),
  };
}

export function saveWorkspaceSnapshot(state: PattaraiWorkspaceRuntime): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      PATTARAI_WORKSPACE_SNAPSHOT_KEY,
      JSON.stringify(toWorkspaceSnapshot(state)),
    );
  } catch {
    console.warn("Pattarai workspace snapshot could not be saved (quota).");
  }
}

export function loadWorkspaceSnapshot(): PattaraiWorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PATTARAI_WORKSPACE_SNAPSHOT_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PattaraiWorkspaceSnapshot;
      if (parsed?.version === 1 && parsed.workspaceId) return parsed;
    } catch {
      /* fall through to legacy */
    }
  }
  return migrateLegacyPrepareSession();
}

function migrateLegacyPrepareSession(): PattaraiWorkspaceSnapshot | null {
  const legacy = loadPrepareSession();
  if (!legacy) return null;
  return {
    version: 1,
    workspaceId: legacy.uploadDraftId || legacy.artwork.id || "migrated",
    artwork: legacy.artwork,
    customBackground: legacy.customBackground ?? "#e8e4dc",
    source: {
      registryKey: legacy.uploadDraftId,
      fileName: legacy.sourceFileName,
    },
    preparation: {
      options: {
        format: "avif",
        quality: 0.82,
        lossless: false,
        chromaSubsampling: "4:4:4",
        filename:
          legacy.sourceFileName?.replace(/\.[^.]+$/, "") ||
          legacy.artwork.metadata.title ||
          "artwork",
      },
      presetId: "perceptual",
      status: "idle",
      fingerprint: null,
    },
    export: { profile: "compatible" },
    savedAt: legacy.savedAt,
  };
}

export function clearWorkspaceSnapshot(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PATTARAI_WORKSPACE_SNAPSHOT_KEY);
}
