import { convertImage } from "@/lib/image-processing/convert";
import type { ConversionResult } from "@/lib/image-processing/types";
import type { StandaloneExportProfile } from "@/lib/html-export/standalone-profile";
import type { PattaraiWorkspaceRuntime } from "./types";
import {
  expectedFingerprint,
  preparedIsValid,
  type WorkspaceAction,
} from "./reducer";
import { profileNeedsWebp } from "./fingerprint";

export type PreparedExportBundle = {
  avif: ConversionResult;
  webp: ConversionResult | null;
  fingerprint: string;
  profile: StandaloneExportProfile;
  filename: string;
  sourceBytes?: number;
};

/**
 * Ensure prepared AVIF (+ WebP when compatible) exists and matches fingerprint.
 * Returns the bundle for export, or null on failure.
 */
export async function ensurePrepared(
  getState: () => PattaraiWorkspaceRuntime,
  dispatch: (action: WorkspaceAction) => void,
): Promise<PreparedExportBundle | null> {
  const state = getState();
  if (!state.source?.objectUrl && !state.artwork.imageSrc) {
    dispatch({
      type: "SET_PREPARATION_STATUS",
      status: "error",
      error: "No source image to prepare",
    });
    return null;
  }

  if (preparedIsValid(state) && state.preparation.preparedAvif) {
    return {
      avif: state.preparation.preparedAvif,
      webp: state.preparation.preparedWebp,
      fingerprint: state.preparation.fingerprint!,
      profile: state.export.profile,
      filename:
        state.artwork.metadata.title.trim() ||
        state.preparation.options.filename ||
        "orientation",
      sourceBytes:
        state.preparation.analysis?.stats.byteSize ?? state.source?.byteSize,
    };
  }

  const source = state.source?.objectUrl || state.artwork.imageSrc;
  const fingerprint = expectedFingerprint(state);
  dispatch({ type: "SET_PREPARATION_STATUS", status: "converting", error: null });

  try {
    const options = {
      ...state.preparation.options,
      format: "avif" as const,
    };
    const avif = await convertImage(
      source,
      options,
      state.preparation.analysis?.stats.byteSize ?? state.source?.byteSize,
    );

    let webp: ConversionResult | null = null;
    if (profileNeedsWebp(state.export.profile)) {
      webp = await convertImage(
        source,
        { ...options, format: "webp" },
        state.preparation.analysis?.stats.byteSize ?? state.source?.byteSize,
      );
    }

    const latest = getState();
    const latestFp = expectedFingerprint(latest);
    if (latestFp !== fingerprint) {
      dispatch({
        type: "SET_PREPARATION_STATUS",
        status: "stale",
        error: null,
      });
      return null;
    }

    dispatch({
      type: "SET_PREPARED",
      avif,
      webp,
      fingerprint,
    });

    return {
      avif,
      webp,
      fingerprint,
      profile: state.export.profile,
      filename:
        state.artwork.metadata.title.trim() ||
        state.preparation.options.filename ||
        "orientation",
      sourceBytes:
        state.preparation.analysis?.stats.byteSize ?? state.source?.byteSize,
    };
  } catch (err) {
    dispatch({
      type: "SET_PREPARATION_STATUS",
      status: "error",
      error: err instanceof Error ? err.message : "Preparation failed",
    });
    return null;
  }
}
