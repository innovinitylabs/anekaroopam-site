import { createId } from "@/lib/perception/engine";
import { createDefaultMetadata } from "@/lib/perception/metadata";
import { defaultConversionOptions } from "@/lib/image-processing/convert";
import { getPreset } from "@/lib/image-processing/presets";
import type {
  ConversionOptions,
  ConversionResult,
  ExportPresetId,
  ImageAnalysis,
} from "@/lib/image-processing/types";
import type { StandaloneExportProfile } from "@/lib/html-export/standalone-profile";
import type { estimateHtmlExport } from "@/lib/html-export/estimate";
import type {
  BackgroundPreset,
  PerceptionArtwork,
  PerceptualState,
} from "@/lib/perception/types";
import type {
  PattaraiWorkspaceRuntime,
  PattaraiWorkspaceSnapshot,
  WorkspaceSource,
} from "./types";
import {
  computePreparationFingerprint,
  isPreparedValid,
} from "./fingerprint";

export function createEmptyArtwork(id: string): PerceptionArtwork {
  return {
    id,
    metadata: createDefaultMetadata({
      year: new Date().getFullYear(),
    }),
    imageSrc: "",
    states: [
      {
        id: createId(),
        name: "",
        angle: 0,
        caption: "",
      },
    ],
    background: "paper",
    initialAngle: 0,
    snapToState: true,
    showMetadataOverlay: true,
  };
}

export function createInitialWorkspaceState(
  snapshot?: PattaraiWorkspaceSnapshot | null,
): PattaraiWorkspaceRuntime {
  const workspaceId = snapshot?.workspaceId ?? createId();
  const perceptual = getPreset("perceptual");
  const baseOptions = {
    ...defaultConversionOptions(
      snapshot?.preparation.options.filename ?? "artwork",
    ),
    ...perceptual.options,
    format: "avif" as const,
  };

  const artwork = snapshot
    ? { ...snapshot.artwork, imageSrc: "" }
    : createEmptyArtwork(workspaceId);

  return {
    workspaceId,
    source: snapshot?.source
      ? {
          registryKey: snapshot.source.registryKey,
          fileName: snapshot.source.fileName,
          mimeType: snapshot.source.mimeType,
          byteSize: snapshot.source.byteSize,
          lastModified: snapshot.source.lastModified,
          objectUrl: null,
        }
      : null,
    artwork,
    customBackground: snapshot?.customBackground ?? "#e8e4dc",
    preparation: {
      options: snapshot?.preparation.options ?? baseOptions,
      presetId: snapshot?.preparation.presetId ?? "perceptual",
      analysis: null,
      status: snapshot?.source ? "stale" : "idle",
      error: null,
      preparedAvif: null,
      preparedWebp: null,
      fingerprint: snapshot?.preparation.fingerprint ?? null,
    },
    export: {
      profile: snapshot?.export.profile ?? "compatible",
      status: "idle",
      error: null,
      lastEstimate: null,
    },
  };
}

export function resolvedArtwork(
  state: PattaraiWorkspaceRuntime,
): PerceptionArtwork {
  return {
    ...state.artwork,
    background:
      state.artwork.background === "custom"
        ? state.customBackground
        : state.artwork.background,
  };
}

export function expectedFingerprint(state: PattaraiWorkspaceRuntime): string {
  return computePreparationFingerprint({
    workspaceId: state.workspaceId,
    source: state.source,
    options: state.preparation.options,
    profile: state.export.profile,
  });
}

export function preparedIsValid(state: PattaraiWorkspaceRuntime): boolean {
  return isPreparedValid({
    fingerprint: state.preparation.fingerprint,
    preparedAvif: state.preparation.preparedAvif,
    preparedWebp: state.preparation.preparedWebp,
    expectedFingerprint: expectedFingerprint(state),
    profile: state.export.profile,
  });
}

export type WorkspaceAction =
  | { type: "HYDRATE_SOURCE_URL"; objectUrl: string }
  | {
      type: "IMPORT_SOURCE";
      source: WorkspaceSource;
      fileNameForTitle?: string;
    }
  | { type: "CLEAR_SOURCE" }
  | { type: "SET_ARTWORK"; artwork: PerceptionArtwork }
  | {
      type: "PATCH_ARTWORK";
      patch: Partial<PerceptionArtwork>;
    }
  | { type: "UPDATE_STATE"; id: string; patch: Partial<PerceptualState> }
  | { type: "ADD_STATE" }
  | { type: "REMOVE_STATE"; id: string }
  | { type: "SET_BACKGROUND"; key: BackgroundPreset }
  | { type: "SET_CUSTOM_BACKGROUND"; hex: string }
  | { type: "SET_OPTIONS"; options: ConversionOptions }
  | { type: "SET_PRESET"; presetId: ExportPresetId; options: ConversionOptions }
  | { type: "SET_ANALYSIS"; analysis: ImageAnalysis | null }
  | { type: "SET_PREPARATION_STATUS"; status: PattaraiWorkspaceRuntime["preparation"]["status"]; error?: string | null }
  | {
      type: "SET_PREPARED";
      avif: ConversionResult;
      webp: ConversionResult | null;
      fingerprint: string;
    }
  | { type: "INVALIDATE_PREPARED" }
  | { type: "SET_EXPORT_PROFILE"; profile: StandaloneExportProfile }
  | {
      type: "SET_EXPORT_STATUS";
      status: PattaraiWorkspaceRuntime["export"]["status"];
      error?: string | null;
    }
  | {
      type: "SET_EXPORT_RESULT";
      estimate: ReturnType<typeof estimateHtmlExport> | null;
      htmlByteSize?: number;
    };

function invalidatePrepared(
  prep: PattaraiWorkspaceRuntime["preparation"],
): PattaraiWorkspaceRuntime["preparation"] {
  return {
    ...prep,
    preparedAvif: null,
    preparedWebp: null,
    fingerprint: null,
    status:
      prep.status === "idle" || prep.status === "error" ? prep.status : "stale",
    error: null,
  };
}

export function workspaceReducer(
  state: PattaraiWorkspaceRuntime,
  action: WorkspaceAction,
): PattaraiWorkspaceRuntime {
  switch (action.type) {
    case "HYDRATE_SOURCE_URL": {
      if (!state.source) return state;
      return {
        ...state,
        source: { ...state.source, objectUrl: action.objectUrl },
        artwork: { ...state.artwork, imageSrc: action.objectUrl },
      };
    }
    case "IMPORT_SOURCE": {
      const title =
        state.artwork.metadata.title ||
        action.fileNameForTitle?.replace(/\.[^.]+$/, "") ||
        "";
      return {
        ...state,
        workspaceId: state.workspaceId,
        source: action.source,
        artwork: {
          ...state.artwork,
          id: state.workspaceId,
          imageSrc: action.source.objectUrl ?? "",
          metadata: {
            ...state.artwork.metadata,
            title: title || state.artwork.metadata.title,
          },
        },
        preparation: {
          ...invalidatePrepared(state.preparation),
          options: {
            ...state.preparation.options,
            filename:
              action.fileNameForTitle?.replace(/\.[^.]+$/, "") ||
              state.preparation.options.filename,
          },
          status: "idle",
        },
      };
    }
    case "CLEAR_SOURCE": {
      const nextId = createId();
      return {
        ...createInitialWorkspaceState(),
        workspaceId: nextId,
        artwork: createEmptyArtwork(nextId),
      };
    }
    case "SET_ARTWORK":
      return { ...state, artwork: action.artwork };
    case "PATCH_ARTWORK":
      return { ...state, artwork: { ...state.artwork, ...action.patch } };
    case "UPDATE_STATE":
      return {
        ...state,
        artwork: {
          ...state.artwork,
          states: state.artwork.states.map((s) =>
            s.id === action.id ? { ...s, ...action.patch } : s,
          ),
        },
      };
    case "ADD_STATE":
      return {
        ...state,
        artwork: {
          ...state.artwork,
          states: [
            ...state.artwork.states,
            {
              id: createId(),
              name: "",
              angle: (state.artwork.states.length * 45) % 360,
              caption: "",
            },
          ],
        },
      };
    case "REMOVE_STATE":
      return {
        ...state,
        artwork: {
          ...state.artwork,
          states: state.artwork.states.filter((s) => s.id !== action.id),
        },
      };
    case "SET_BACKGROUND":
      return {
        ...state,
        artwork: { ...state.artwork, background: action.key },
      };
    case "SET_CUSTOM_BACKGROUND":
      return { ...state, customBackground: action.hex };
    case "SET_OPTIONS":
      return {
        ...state,
        preparation: {
          ...invalidatePrepared(state.preparation),
          options: action.options,
          status: state.source ? "stale" : state.preparation.status,
        },
      };
    case "SET_PRESET":
      return {
        ...state,
        preparation: {
          ...invalidatePrepared(state.preparation),
          presetId: action.presetId,
          options: action.options,
          status: state.source ? "stale" : state.preparation.status,
        },
      };
    case "SET_ANALYSIS":
      return {
        ...state,
        preparation: { ...state.preparation, analysis: action.analysis },
      };
    case "SET_PREPARATION_STATUS":
      return {
        ...state,
        preparation: {
          ...state.preparation,
          status: action.status,
          error: action.error !== undefined ? action.error : state.preparation.error,
        },
      };
    case "SET_PREPARED":
      return {
        ...state,
        preparation: {
          ...state.preparation,
          preparedAvif: action.avif,
          preparedWebp: action.webp,
          fingerprint: action.fingerprint,
          status: "ready",
          error: null,
        },
      };
    case "INVALIDATE_PREPARED":
      return {
        ...state,
        preparation: invalidatePrepared(state.preparation),
      };
    case "SET_EXPORT_PROFILE": {
      const next = {
        ...state,
        export: { ...state.export, profile: action.profile },
      };
      const stillValid = preparedIsValid({
        ...next,
        preparation: state.preparation,
        export: { ...state.export, profile: action.profile },
      });
      if (stillValid) return next;
      return {
        ...next,
        preparation: invalidatePrepared(state.preparation),
      };
    }
    case "SET_EXPORT_STATUS":
      return {
        ...state,
        export: {
          ...state.export,
          status: action.status,
          error: action.error !== undefined ? action.error : state.export.error,
        },
      };
    case "SET_EXPORT_RESULT":
      return {
        ...state,
        export: {
          ...state.export,
          lastEstimate: action.estimate,
          lastHtmlByteSize: action.htmlByteSize,
          status: "done",
          error: null,
        },
      };
    default:
      return state;
  }
}
