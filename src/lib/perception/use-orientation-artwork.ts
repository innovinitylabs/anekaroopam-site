"use client";

import { useCallback, useState } from "react";
import { createId } from "@/lib/perception/engine";
import { createDefaultMetadata, mergeArtworkMetadata } from "@/lib/perception/metadata";
import {
  registerTransientUpload,
  revokeTransientUpload,
} from "@/lib/archive/transient-upload-registry";
import type {
  BackgroundPreset,
  PerceptionArtwork,
  PerceptualState,
} from "@/lib/perception/types";

export function defaultOrientationArtwork(
  partial?: Partial<PerceptionArtwork>,
): PerceptionArtwork {
  return {
    id: partial?.id ?? "draft",
    metadata: createDefaultMetadata({
      year: new Date().getFullYear(),
      ...partial?.metadata,
    }),
    imageSrc: partial?.imageSrc ?? "",
    states: partial?.states ?? [
      {
        id: createId(),
        name: "",
        angle: 0,
        caption: "",
      },
    ],
    background: partial?.background ?? "paper",
    initialAngle: partial?.initialAngle ?? 0,
    snapToState: partial?.snapToState ?? true,
    showMetadataOverlay: partial?.showMetadataOverlay ?? true,
    overlayFields: partial?.overlayFields,
  };
}

export interface UseOrientationArtworkOptions {
  initial?: PerceptionArtwork;
  value?: PerceptionArtwork;
  onChange?: (artwork: PerceptionArtwork) => void;
  /** Registry key for source file (ingest draft id or artwork id). */
  uploadDraftId?: string;
}

export function useOrientationArtwork(options: UseOrientationArtworkOptions = {}) {
  const isControlled = options.value !== undefined && options.onChange !== undefined;
  const [internal, setInternal] = useState<PerceptionArtwork>(
    () => options.initial ?? options.value ?? defaultOrientationArtwork(),
  );
  const [customBg, setCustomBg] = useState("#e8e4dc");
  const [panelVisible, setPanelVisible] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const artwork = isControlled ? options.value! : internal;
  const setArtwork = useCallback(
    (next: PerceptionArtwork | ((prev: PerceptionArtwork) => PerceptionArtwork)) => {
      const resolved =
        typeof next === "function"
          ? next(isControlled ? options.value! : internal)
          : next;
      if (isControlled) {
        options.onChange!(resolved);
      } else {
        setInternal(resolved);
      }
    },
    [isControlled, options, internal],
  );

  const registryKey = options.uploadDraftId ?? artwork.id;

  const updateState = useCallback(
    (id: string, patch: Partial<PerceptualState>) => {
      setArtwork((prev) => ({
        ...prev,
        states: prev.states.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [setArtwork],
  );

  const addState = useCallback(() => {
    setArtwork((prev) => ({
      ...prev,
      states: [
        ...prev.states,
        {
          id: createId(),
          name: "",
          angle: (prev.states.length * 45) % 360,
          caption: "",
        },
      ],
    }));
  }, [setArtwork]);

  const removeState = useCallback(
    (id: string) => {
      setArtwork((prev) => ({
        ...prev,
        states: prev.states.filter((s) => s.id !== id),
      }));
    },
    [setArtwork],
  );

  const handleImport = useCallback(
    async (file: File) => {
      const entry = registerTransientUpload(registryKey, file);
      setArtwork((prev) => ({
        ...prev,
        imageSrc: entry.objectUrl,
        metadata: mergeArtworkMetadata({
          ...prev.metadata,
          title:
            prev.metadata.title ||
            file.name.replace(/\.[^.]+$/, ""),
        }),
      }));
    },
    [setArtwork, registryKey],
  );

  const clearImport = useCallback(() => {
    revokeTransientUpload(registryKey);
    setArtwork((prev) => ({ ...prev, imageSrc: "" }));
  }, [registryKey, setArtwork]);

  const resolvedArtwork: PerceptionArtwork = {
    ...artwork,
    background:
      artwork.background === "custom" ? customBg : artwork.background,
  };

  const setBackground = useCallback(
    (key: BackgroundPreset) => {
      setArtwork((p) => ({ ...p, background: key }));
    },
    [setArtwork],
  );

  return {
    artwork,
    setArtwork,
    customBg,
    setCustomBg,
    panelVisible,
    setPanelVisible,
    dragOver,
    setDragOver,
    updateState,
    addState,
    removeState,
    handleImport,
    clearImport,
    resolvedArtwork,
    setBackground,
    uploadDraftId: registryKey,
  };
}

export type OrientationArtworkController = ReturnType<typeof useOrientationArtwork>;
