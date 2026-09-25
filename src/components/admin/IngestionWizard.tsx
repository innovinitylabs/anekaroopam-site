"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/components/admin/admin-fetch";
import {
  formatWizardStatusHeader,
  generateEndpointKind,
  isExistingArchiveBundle,
  isRegenerateBlocked,
  usesSyncOnPublishStep,
} from "@/components/admin/admin-workflow-state";
import { EmbeddedPreparePanel } from "@/components/admin/EmbeddedPreparePanel";
import { ImageDropZone } from "@/components/perception-tools/ImageDropZone";
import { PerceptionCanvas } from "@/components/perception/PerceptionCanvas";
import {
  BackgroundPanel,
  ImportZone,
  MetadataPanelSection,
  PerceptualStatesPanel,
} from "@/components/perception/OrientationPanels";
import {
  defaultOrientationArtwork,
  useOrientationArtwork,
} from "@/lib/perception/use-orientation-artwork";
import { saveIngestDraftSession } from "@/lib/export-engine/session";
import { hydrateArtworkPreview } from "@/lib/export-engine/session-artwork";
import {
  commitBrowserDurableBundle,
  revokePreparedPreview,
  type LocalPreparedMaster,
} from "@/lib/archive/browser-durable-commit";
import { commitBrowserR2Bundle } from "@/lib/archive/browser-r2-commit";
import {
  commitPhaseLabel,
  type ArchiveCommitPhase,
} from "@/lib/archive/commit-state";
import {
  formatByteSize,
  MAX_BUNDLE_BINARY_BYTES,
  MAX_SOURCE_BYTES,
} from "@/lib/archive/commit-bundle-limits";
import {
  createBrowserLocalDraft,
  deleteLocalDraft,
  loadLocalDraft,
  newLocalDraftId,
  saveLocalDraft,
} from "@/lib/archive/local-draft-store";
import {
  AccessionDraftSchema,
  ARCHIVE_VERSION,
  buildArchiveSlug,
  emptyProvenance,
  normalizeArchiveSlug,
  type AccessionDraft,
  type DraftStatus,
  type ProvenanceRecord,
} from "@/lib/archive/schema";
import {
  installUploadRegistryBridge,
  registerTransientUpload,
  remapTransientUpload,
  resolveFileFromAnyTab,
  resolveObjectUrlFromAnyTab,
  revokeTransientUpload,
} from "@/lib/archive/transient-upload-registry";
import {
  footerPrimaryLabel,
  resolveFooterPrimaryAction,
  resolveReviewSubmitState,
  reviewSubmitLabel,
  wizardStepsForMode,
  WIZARD_DONE_HREF,
  type WizardStep,
} from "@/lib/archive/wizard-steps";
import {
  generateSeoFromMetadata,
  isMetadataFinalized,
  type SeoMetadata,
} from "@/lib/archive/archive-seo";
import {
  hydrateOriginalFile,
  hydratePreparedLocal,
} from "@/lib/archive/hydrate-worker-source";
import { canUpdateAndPublish } from "@/lib/archive/ingest-source-gates";
import {
  buildSourcePreviewMeta,
  deriveSourcePipelineStatus,
  PIPELINE_STATUS_LABELS,
  readImageDimensions,
} from "@/lib/archive/upload-source-preview";
import type { PerceptionArtwork } from "@/lib/perception/types";

type StepId = WizardStep;

type DraftResponse = {
  draft?: AccessionDraft;
  archiveStatus?: DraftStatus | null;
  error?: string;
};

const STEP_TOOLTIPS: Record<string, string> = {
  Upload:
    "Select the original master. It stays in this browser until Publish Artwork; nothing is uploaded yet.",
  Prepare:
    "Encode an orientation-safe prepared master locally in the browser. No remote write.",
  Orientation:
    "Define perceptual states, snap behavior, and the viewing background for export.",
  Metadata:
    "Edit accession title, date, process, and other archival metadata fields.",
  SEO:
    "Generate and review page title, description, and structured data from finalized metadata only.",
  Generate:
    "Local non-durable: deposit source and run server generate. Hidden in durable mode.",
  Publish:
    "Local non-durable: promote or sync on GitHub. Hidden in durable mode.",
  Provenance:
    "Record mint, auction, and marketplace links. Stays local until Publish.",
  Visibility:
    "Choose whether this accession is public, admin-only (generated), or hidden after Publish.",
  Review:
    "Validate the local draft, then Publish Artwork or Update & Publish once.",
};

function artworkForStorage(
  artwork: PerceptionArtwork,
  accessionId: string,
): PerceptionArtwork {
  return {
    ...artwork,
    imageSrc: "",
    metadata: {
      ...artwork.metadata,
      accessionId,
    },
  };
}

function firstMint(provenance: ProvenanceRecord) {
  return (
    provenance.mint[0] ?? {
      label: "Mint",
      platform: "",
      url: "",
      chain: "",
    }
  );
}

type SyncUiState =
  | "idle"
  | "local_changed"
  | "publish_pending"
  | "syncing"
  | "synced"
  | "sync_failed";

function isExistingArchiveDraft(
  draft: AccessionDraft | null,
  draftId: string,
  archiveStatus: DraftStatus | null,
): boolean {
  return isExistingArchiveBundle(draft, draftId, archiveStatus);
}

export function IngestionWizard({
  initialDraftId,
  initialEditSlug,
}: {
  initialDraftId?: string;
  initialEditSlug?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("Upload");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState(initialDraftId ?? "");
  const [accessionId, setAccessionId] = useState("");
  const [slug, setSlug] = useState("");
  const [slugLocked, setSlugLocked] = useState(false);
  const [status, setStatus] = useState("draft");
  const [provenance, setProvenance] = useState<ProvenanceRecord>(emptyProvenance());
  const [currentDraft, setCurrentDraft] = useState<AccessionDraft | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<DraftStatus | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [result, setResult] = useState<{
    slug: string;
    files: { path: string; bytes: number }[];
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncUiState, setSyncUiState] = useState<SyncUiState>("idle");
  const [lastSyncCommitSha, setLastSyncCommitSha] = useState<string | null>(null);
  const [durableStorage, setDurableStorage] = useState(false);
  const [r2Archive, setR2Archive] = useState(false);
  const [d1Archive, setD1Archive] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [preparedLocal, setPreparedLocal] = useState<LocalPreparedMaster | null>(
    null,
  );
  const [committing, setCommitting] = useState(false);
  const [localDraftKey, setLocalDraftKey] = useState<string | null>(null);
  const [intendedStatus, setIntendedStatus] = useState<
    "generated" | "published" | "hidden"
  >("published");
  const [commitCompleted, setCommitCompleted] = useState(false);
  const [commitInFlight, setCommitInFlight] = useState(false);
  const [lastCommittedSha, setLastCommittedSha] = useState<string | null>(null);
  const [commitPhase, setCommitPhase] = useState<ArchiveCommitPhase>("idle");
  const [sourceHydrating, setSourceHydrating] = useState(false);
  const [serverSourceUnavailable, setServerSourceUnavailable] = useState(false);
  const [sourceDimensions, setSourceDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/session", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          durableStorage?: boolean;
          r2Archive?: boolean;
          d1Archive?: boolean;
        };
        if (!cancelled) {
          setDurableStorage(Boolean(data.durableStorage));
          setR2Archive(Boolean(data.r2Archive));
          setD1Archive(Boolean(data.d1Archive));
          setSessionReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDurableStorage(false);
          setR2Archive(false);
          setD1Archive(false);
          setSessionReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const STEPS = useMemo(
    () => wizardStepsForMode(durableStorage),
    [durableStorage],
  );

  const isExistingArchive = useMemo(
    () => isExistingArchiveDraft(currentDraft, draftId, archiveStatus),
    [archiveStatus, currentDraft, draftId],
  );

  const deployUsesSync = useMemo(
    () => usesSyncOnPublishStep(currentDraft, draftId, archiveStatus),
    [archiveStatus, currentDraft, draftId],
  );

  const initialArtwork = useMemo(() => defaultOrientationArtwork(), []);

  const [artwork, setArtwork] = useState<PerceptionArtwork>(initialArtwork);
  const controller = useOrientationArtwork({
    value: artwork,
    onChange: setArtwork,
    uploadDraftId: draftId || "pending-draft",
  });

  const applyDraft = useCallback((draft: AccessionDraft, file?: File | null) => {
    const mappedFile =
      file ??
      resolveFileFromAnyTab(draft.draftId) ??
      resolveFileFromAnyTab("pending-draft");
    if (mappedFile) {
      remapTransientUpload("pending-draft", draft.draftId);
      if (!resolveFileFromAnyTab(draft.draftId)) {
        registerTransientUpload(draft.draftId, mappedFile);
      }
    }
    const objectUrl = resolveObjectUrlFromAnyTab(draft.draftId);
    setDraftId(draft.draftId);
    setAccessionId(draft.accessionId);
    setStatus(draft.status);
    setCurrentDraft(draft);
    setSlug(draft.slug);
    setSlugLocked(draft.slugLocked);
    setProvenance(draft.provenance);
    if (mappedFile) setSourceFile(mappedFile);
    const draftArtwork = {
      ...draft.artwork,
      metadata: {
        ...draft.artwork.metadata,
        accessionId: draft.accessionId,
      },
    };
    setArtwork(
      objectUrl
        ? hydrateArtworkPreview(draftArtwork, objectUrl)
        : draftArtwork.imageSrc
          ? draftArtwork
          : { ...draftArtwork, imageSrc: "" },
    );
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    installUploadRegistryBridge();
    return () => {
      revokeTransientUpload(draftId);
    };
  }, [draftId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrCreateDraft() {
      setError(null);
      if (initialEditSlug) {
        setDraftLoaded(false);
        try {
          const res = await adminFetch(
            `/api/admin/archive/${encodeURIComponent(initialEditSlug)}/hydrate-draft`,
            { method: "POST" },
          );
          const data = (await res.json()) as DraftResponse;
          if (!res.ok || !data.draft) {
            throw new Error(data.error ?? "Could not hydrate archive for edit");
          }
          if (!cancelled) {
            const key = newLocalDraftId();
            setLocalDraftKey(key);
            applyDraft(data.draft);
            setArchiveStatus(data.draft.status ?? null);
            await saveLocalDraft({
              schemaVersion: 1,
              localId: key,
              draftId: data.draft.draftId,
              accessionId: data.draft.accessionId,
              slug: data.draft.slug,
              step: "Upload",
              artworkJson: JSON.stringify(data.draft.artwork),
              provenanceJson: JSON.stringify(data.draft.provenance),
              intendedStatus: "published",
              isRevision: true,
              existingSlug: data.draft.slug,
              sourceFileName: null,
              sourceMimeType: null,
              sourceByteSize: null,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Edit hydrate failed");
          }
        }
        return;
      }

      if (!initialDraftId) {
        // Resume newest local draft if present via ?local= is handled below
        const localParam =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("local")
            : null;
        if (localParam) {
          setDraftLoaded(false);
          try {
            const record = await loadLocalDraft(localParam);
            if (!record) {
              throw new Error("Local draft not found in IndexedDB");
            }
            const artwork = JSON.parse(record.artworkJson);
            const draft = AccessionDraftSchema.parse({
              version: ARCHIVE_VERSION,
              draftId: record.draftId,
              accessionId: record.accessionId,
              status: "draft",
              slug: record.slug,
              slugLocked: record.isRevision,
              slugHistory: [],
              source: record.sourceFileName
                ? {
                    kind: "original",
                    originalFilename: record.sourceFileName,
                    mimeType: record.sourceMimeType ?? undefined,
                    byteSize: record.sourceByteSize ?? undefined,
                  }
                : { kind: "migration-required" },
              processing: {},
              artwork,
              provenance: JSON.parse(record.provenanceJson),
              export: {
                standaloneHtml: "perception.html",
                includeWebpFallback: true,
                preset: "archival",
              },
              createdAt: record.updatedAt,
              updatedAt: record.updatedAt,
            });
            if (!cancelled) {
              setLocalDraftKey(record.localId);
              setIntendedStatus(record.intendedStatus);
              let file: File | null = null;
              if (record.sourceBlob) {
                file = new File(
                  [record.sourceBlob],
                  record.sourceFileName ?? "original.bin",
                  {
                    type:
                      record.sourceMimeType ??
                      record.sourceBlob.type ??
                      "application/octet-stream",
                  },
                );
                registerTransientUpload(draft.draftId, file);
              }
              applyDraft(draft, file);
              if (record.preparedBlob) {
                setPreparedLocal({
                  blob: record.preparedBlob,
                  width: record.preparedWidth ?? 1,
                  height: record.preparedHeight ?? 1,
                  objectUrl: URL.createObjectURL(record.preparedBlob),
                  preparedAt: record.preparedAt ?? record.updatedAt,
                });
              }
              if (
                record.step === "Prepare" ||
                record.step === "Orientation" ||
                record.step === "Metadata" ||
                record.step === "SEO" ||
                record.step === "Provenance" ||
                record.step === "Visibility" ||
                record.step === "Review"
              ) {
                setStep(record.step);
              }
            }
          } catch (e) {
            if (!cancelled) {
              setError(
                e instanceof Error ? e.message : "Local draft resume failed",
              );
              setDraftLoaded(true);
            }
          }
          return;
        }

        if (!cancelled) setDraftLoaded(true);
        return;
      }

      setDraftLoaded(false);
      try {
        const res = await adminFetch(
          `/api/admin/drafts/${encodeURIComponent(initialDraftId)}`,
        );
        const data = (await res.json()) as DraftResponse;
        if (!res.ok || !data.draft) {
          throw new Error(data.error ?? "Draft could not be loaded");
        }
        if (!cancelled) {
          applyDraft(data.draft);
          setArchiveStatus(data.archiveStatus ?? null);
          setServerSourceUnavailable(
            data.draft.source?.kind !== "original",
          );

          // D1/R2 reopen: hydrate original (+ prepared when present) via admin proxy.
          if (
            data.draft.source?.kind === "original" &&
            !resolveFileFromAnyTab(data.draft.draftId)
          ) {
            setSourceHydrating(true);
            try {
              const hydrated = await hydrateOriginalFile(data.draft.draftId);
              if ("error" in hydrated) {
                if (!cancelled) {
                  setServerSourceUnavailable(true);
                  setError(hydrated.error.message);
                }
              } else if (!cancelled) {
                setSourceFile(hydrated.file);
                registerTransientUpload(data.draft.draftId, hydrated.file);
                setServerSourceUnavailable(false);
                void readImageDimensions(hydrated.file).then((dims) => {
                  if (!cancelled) setSourceDimensions(dims);
                });
                if (data.draft.processing?.preparedSource) {
                  const prepared = await hydratePreparedLocal(
                    data.draft.draftId,
                  );
                  if (!("error" in prepared) && !cancelled) {
                    setPreparedLocal(prepared);
                  }
                }
              }
            } catch (hydrateErr) {
              if (!cancelled) {
                setServerSourceUnavailable(true);
                setError(
                  hydrateErr instanceof Error
                    ? hydrateErr.message
                    : "Source hydration failed",
                );
              }
            } finally {
              if (!cancelled) setSourceHydrating(false);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Draft load failed");
        }
      }
    }

    loadOrCreateDraft();
    return () => {
      cancelled = true;
    };
  }, [applyDraft, initialDraftId, initialEditSlug]);

  useEffect(() => {
    if (!draftLoaded || slugLocked) return;
    const date =
      artwork.metadata.date ?? new Date().toISOString().slice(0, 10);
    const title = artwork.metadata.title || "untitled";
    const timeout = window.setTimeout(() => setSlug(buildArchiveSlug(date, title)), 0);
    return () => window.clearTimeout(timeout);
  }, [artwork.metadata.date, artwork.metadata.title, draftLoaded, slugLocked]);

  useEffect(() => {
    if (!draftLoaded || !draftId) return;
    saveIngestDraftSession({
      draftId,
      artwork: controller.artwork,
      customBackground: controller.customBg,
      sourceFileName: sourceFile?.name,
      provenance,
    });
  }, [
    draftLoaded,
    draftId,
    controller.artwork,
    controller.customBg,
    sourceFile?.name,
    provenance,
  ]);

  useEffect(() => {
    if (!draftLoaded || !draftId) return;
    let cancelled = false;

    async function refreshArchiveStatus() {
      if (durableStorage && draftId.startsWith("draft-") && localDraftKey) {
        // Local-only provisional drafts are not on the server yet.
        return;
      }
      try {
        const res = await adminFetch(
          `/api/admin/drafts/${encodeURIComponent(draftId)}`,
        );
        const data = (await res.json()) as DraftResponse;
        if (!cancelled && res.ok) {
          setArchiveStatus(data.archiveStatus ?? null);
        }
      } catch {
        /* archive status is informational only */
      }
    }

    void refreshArchiveStatus();
    return () => {
      cancelled = true;
    };
  }, [draftId, draftLoaded, durableStorage, localDraftKey, slug]);

  const buildDraftSnapshot = useCallback((): AccessionDraft | null => {
    if (!draftId || !accessionId || !slug) return null;
    const base = currentDraft;
    const now = new Date().toISOString();
    return {
      version: ARCHIVE_VERSION,
      draftId,
      accessionId,
      status: (base?.status ?? "draft") as DraftStatus,
      slug,
      slugLocked,
      slugHistory: base?.slugHistory ?? [],
      source: base?.source ?? { kind: "migration-required" },
      processing: base?.processing ?? {},
      artwork: artworkForStorage(controller.artwork, accessionId),
      provenance,
      export: base?.export ?? {
        standaloneHtml: "perception.html",
        includeWebpFallback: true,
        preset: "archival",
      },
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
      preparedAt: preparedLocal?.preparedAt ?? base?.preparedAt,
      generatedAt: base?.generatedAt,
      publishedAt: base?.publishedAt,
      mintedAt: base?.mintedAt,
      hiddenAt: base?.hiddenAt,
      withdrawnAt: base?.withdrawnAt,
      deletedAt: base?.deletedAt,
    };
  }, [
    accessionId,
    controller.artwork,
    currentDraft,
    draftId,
    preparedLocal?.preparedAt,
    provenance,
    slug,
    slugLocked,
  ]);

  const saveDraft = useCallback(async () => {
    if (!draftLoaded || !draftId) return null;

    // Durable browser path: keep blobs in IndexedDB (plan reuse).
    // When D1 is preferred, also PATCH metadata to the Worker via /api/admin/drafts.
    if (durableStorage) {
      const snapshot = buildDraftSnapshot();
      if (!snapshot) return null;
      const key = localDraftKey ?? newLocalDraftId();
      if (!localDraftKey) setLocalDraftKey(key);
      try {
        await saveLocalDraft({
          schemaVersion: 1,
          localId: key,
          draftId: snapshot.draftId,
          accessionId: snapshot.accessionId,
          slug: snapshot.slug,
          step,
          artworkJson: JSON.stringify(snapshot.artwork),
          provenanceJson: JSON.stringify(snapshot.provenance),
          intendedStatus,
          isRevision: isExistingArchive,
          existingSlug: isExistingArchive ? snapshot.slug : null,
          sourceFileName: sourceFile?.name ?? null,
          sourceMimeType: sourceFile?.type ?? null,
          sourceByteSize: sourceFile?.size ?? null,
          updatedAt: snapshot.updatedAt,
          sourceBlob: sourceFile ?? undefined,
          preparedBlob: preparedLocal?.blob,
          preparedWidth: preparedLocal?.width,
          preparedHeight: preparedLocal?.height,
          preparedAt: preparedLocal?.preparedAt,
        });
      } catch (e) {
        // IndexedDB failure should not block editing; keep SPA state.
        console.warn("local draft save failed", e);
      }

      if (d1Archive) {
        const res = await adminFetch(
          `/api/admin/drafts/${encodeURIComponent(draftId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug,
              slugLocked,
              artwork: artworkForStorage(controller.artwork, accessionId),
              provenance,
            }),
          },
        );
        const data = (await res.json()) as DraftResponse;
        if (!res.ok || !data.draft) {
          throw new Error(data.error ?? "D1 draft save failed");
        }
        setStatus(data.draft.status);
        setCurrentDraft(data.draft);
        setAccessionId(data.draft.accessionId);
        return data.draft;
      }

      setStatus(snapshot.status);
      setCurrentDraft(snapshot);
      return snapshot;
    }

    const res = await adminFetch(`/api/admin/drafts/${encodeURIComponent(draftId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        slugLocked,
        artwork: artworkForStorage(controller.artwork, accessionId),
        provenance,
      }),
    });
    const data = (await res.json()) as DraftResponse;
    if (!res.ok || !data.draft) {
      throw new Error(data.error ?? "Draft save failed");
    }
    setStatus(data.draft.status);
    setCurrentDraft(data.draft);
    return data.draft;
  }, [
    accessionId,
    buildDraftSnapshot,
    controller.artwork,
    d1Archive,
    draftId,
    draftLoaded,
    durableStorage,
    intendedStatus,
    isExistingArchive,
    localDraftKey,
    preparedLocal,
    provenance,
    slug,
    slugLocked,
    sourceFile,
    step,
  ]);

  useEffect(() => {
    if (!draftLoaded || !draftId) return;
    const timeout = window.setTimeout(() => {
      saveDraft().catch((e) => {
        // IndexedDB-only durable (GitHub path) soft-fails; D1/FS paths surface errors.
        if (!durableStorage || d1Archive) {
          setError(e instanceof Error ? e.message : "Draft autosave failed");
        }
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [d1Archive, draftId, draftLoaded, durableStorage, saveDraft]);

  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next as StepId);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev as StepId);
  };

  const handleSourceFile = useCallback(
    async (file: File) => {
      setError(null);
      setCommitError(null);
      setCommitCompleted(false);
      setLastCommittedSha(null);
      registerTransientUpload(draftId || "pending-draft", file);
      setSourceFile(file);
      setSourceDimensions(null);
      void readImageDimensions(file).then((dims) => {
        setSourceDimensions(dims);
      });
      revokePreparedPreview(preparedLocal);
      setPreparedLocal(null);

      const titleFromFile = file.name.replace(/\.[^.]+$/, "");
      setArtwork((prev) => {
        const entry = resolveObjectUrlFromAnyTab(draftId || "pending-draft");
        return hydrateArtworkPreview(
          {
            ...prev,
            metadata: {
              ...prev.metadata,
              accessionId,
              title: prev.metadata.title || titleFromFile,
            },
          },
          entry ?? URL.createObjectURL(file),
        );
      });
      setUploadInputKey((k) => k + 1);

      try {
        let nextDraft = currentDraft;
        if (!draftId) {
          // D1 path: allocate accession at draft create via Worker (server mint).
          // GitHub durable: keep browser-local draft until R2 commit (blobs stay local).
          // Non-durable: create FS draft immediately.
          const useLocalDraft =
            !sessionReady || (durableStorage && !d1Archive);
          if (useLocalDraft) {
            nextDraft = createBrowserLocalDraft(titleFromFile);
            const key = newLocalDraftId();
            setLocalDraftKey(key);
          } else {
            const res = await adminFetch("/api/admin/drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: titleFromFile }),
            });
            const data = (await res.json()) as DraftResponse;
            if (!res.ok || !data.draft) {
              throw new Error(data.error ?? "Could not create metadata draft");
            }
            nextDraft = data.draft;
            if (d1Archive) {
              const key = newLocalDraftId();
              setLocalDraftKey(key);
            }
          }
        }

        if (!nextDraft) {
          throw new Error("Draft is not available");
        }

        remapTransientUpload("pending-draft", nextDraft.draftId);
        registerTransientUpload(nextDraft.draftId, file);
        applyDraft(nextDraft, file);
        setStep("Prepare");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start draft");
      }
    },
    [
      accessionId,
      applyDraft,
      currentDraft,
      d1Archive,
      draftId,
      durableStorage,
      preparedLocal,
      sessionReady,
    ],
  );

  const resolveSourceBlob = useCallback(async (): Promise<File> => {
    if (sourceFile) return sourceFile;
    const fromRegistry =
      (draftId ? resolveFileFromAnyTab(draftId) : null) ??
      resolveFileFromAnyTab("pending-draft");
    if (fromRegistry) return fromRegistry;
    const objectUrl = draftId ? resolveObjectUrlFromAnyTab(draftId) : null;
    if (objectUrl) {
      const res = await fetch(objectUrl);
      if (!res.ok) throw new Error("Could not read browser source preview");
      const blob = await res.blob();
      return new File([blob], "source.bin", {
        type: blob.type || "application/octet-stream",
      });
    }
    throw new Error(
      "Source image is not available in this browser tab. Re-select the master on Upload, then prepare/commit again.",
    );
  }, [draftId, sourceFile]);

  const handlePreparedLocal = useCallback((next: LocalPreparedMaster) => {
    setPreparedLocal((prev) => {
      revokePreparedPreview(prev);
      return next;
    });
    setError(null);
  }, []);

  const handleCommitAccession = useCallback(async () => {
    if (!draftId || !currentDraft) return;
    if (commitCompleted || lastCommittedSha || commitInFlight || committing) {
      return;
    }
    setCommitInFlight(true);
    setCommitting(true);
    setError(null);
    setCommitError(null);
    setResult(null);
    setCommitPhase("preparing");
    try {
      if (!durableStorage) {
        throw new Error(
          "Durable storage is required for Publish Artwork.",
        );
      }
      const saved = await saveDraft();
      const draftForCommit = saved ?? currentDraft;
      const file = await resolveSourceBlob();
      if (file.size > MAX_SOURCE_BYTES) {
        throw new Error(
          `Source file is ${formatByteSize(file.size)} (limit ${formatByteSize(MAX_SOURCE_BYTES)}). Use a smaller original master.`,
        );
      }
      if (!preparedLocal) {
        throw new Error("Prepare a working master before Publish.");
      }

      if (r2Archive) {
        const committed = await commitBrowserR2Bundle({
          draft: draftForCommit,
          sourceFile: file,
          prepared: preparedLocal,
          isExistingArchive,
          intendedStatus,
          message: isExistingArchive
            ? `archive: revision ${draftForCommit.slug}`
            : `archive: accession ${draftForCommit.slug}`,
          onPhase: (phase) => setCommitPhase(phase),
        });
        setResult({
          slug: committed.slug,
          files: committed.files,
          warnings: committed.warnings,
        });
        applyDraft(committed.draft, file);
        setArchiveStatus(committed.archiveStatus);
        setStatus(committed.archiveStatus);
        setLastSyncCommitSha(committed.commitSha);
        setLastCommittedSha(committed.commitSha);
        setCommitCompleted(true);
        setSyncUiState("synced");
        setCommitPhase("committed");
        if (localDraftKey) {
          await deleteLocalDraft(localDraftKey);
          setLocalDraftKey(null);
        }
      } else {
        const committed = await commitBrowserDurableBundle({
          draft: draftForCommit,
          sourceFile: file,
          prepared: preparedLocal,
          isExistingArchive,
          intendedStatus,
          message: isExistingArchive
            ? `archive: revision ${draftForCommit.slug}`
            : `archive: accession ${draftForCommit.slug}`,
        });
        setResult({
          slug: committed.slug,
          files: committed.files,
          warnings: committed.warnings,
        });
        applyDraft(committed.draft, file);
        setArchiveStatus(committed.archiveStatus);
        setStatus(committed.archiveStatus);
        setLastSyncCommitSha(committed.commitSha);
        setLastCommittedSha(committed.commitSha);
        setCommitCompleted(true);
        setSyncUiState("synced");
        setCommitPhase("committed");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publish failed";
      setError(message);
      setCommitError(message);
      const phaseFromError =
        e && typeof e === "object" && "phase" in e
          ? (e as { phase?: ArchiveCommitPhase }).phase
          : undefined;
      if (phaseFromError) {
        setCommitPhase(phaseFromError);
      } else if (message.includes("metadata commit failed")) {
        setCommitPhase("failed_metadata");
      } else if (message.includes("upload-verify") || message.includes("verification")) {
        setCommitPhase("failed_verify");
      } else if (message.includes("R2 upload failed") || message.includes("upload-auth")) {
        setCommitPhase("failed_upload");
      } else {
        setCommitPhase("failed_upload");
      }
      // Never mark success on failure paths.
      setCommitCompleted(false);
    } finally {
      setCommitting(false);
      setCommitInFlight(false);
    }
  }, [
    applyDraft,
    commitCompleted,
    commitInFlight,
    committing,
    currentDraft,
    draftId,
    durableStorage,
    intendedStatus,
    isExistingArchive,
    lastCommittedSha,
    localDraftKey,
    preparedLocal,
    r2Archive,
    resolveSourceBlob,
    saveDraft,
  ]);

  const handleGenerate = async () => {
    if (!draftId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setSyncUiState("idle");
    setLastSyncCommitSha(null);

    try {
      const saved = await saveDraft();
      const draftForGenerate = saved ?? currentDraft;
      if (!draftForGenerate) {
        throw new Error("Draft is not loaded");
      }

      if (durableStorage) {
        throw new Error(
          "Durable mode does not Generate mid-wizard. Use Review → Publish Artwork for the single write.",
        );
      }

      // Local non-durable fallback: deposit source then server generate.
      const file = await resolveSourceBlob();
      const form = new FormData();
      form.append("source", file);
      const uploadRes = await adminFetch(
        `/api/admin/drafts/${encodeURIComponent(draftId)}/source`,
        { method: "POST", body: form },
      );
      const uploadData = (await uploadRes.json()) as DraftResponse;
      if (!uploadRes.ok || !uploadData.draft) {
        throw new Error(uploadData.error ?? "Source deposit failed");
      }
      applyDraft(uploadData.draft, file);

      const endpointKind = generateEndpointKind(
        uploadData.draft,
        draftId,
        archiveStatus,
      );
      const endpoint =
        endpointKind === "regenerate"
          ? `/api/admin/drafts/${encodeURIComponent(draftId)}/regenerate`
          : `/api/admin/drafts/${encodeURIComponent(draftId)}/generate`;
      const res = await adminFetch(endpoint, { method: "POST" });
      const data = (await res.json()) as {
        slug?: string;
        files?: { path: string; bytes: number }[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.error ??
            (endpointKind === "regenerate"
              ? "Regeneration failed"
              : "Generation failed"),
        );
      }
      setResult({
        slug: data.slug ?? slug,
        files: data.files ?? [],
        warnings: data.warnings ?? [],
      });
      const nextArchiveStatus: DraftStatus =
        deployUsesSync || isExistingArchive
          ? (archiveStatus ?? uploadData.draft.status ?? "generated")
          : "generated";
      setArchiveStatus(nextArchiveStatus);
      if (deployUsesSync) {
        setSyncUiState("local_changed");
      } else if (isExistingArchive) {
        setSyncUiState("publish_pending");
      } else {
        setStatus("generated");
        setSyncUiState("idle");
      }
      setStep("Publish");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive export failed");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!result?.slug) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/archive/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: result.slug, draftId }),
      });
      const data = (await res.json()) as { error?: string; commitSha?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Publish failed");
      }
      setStatus("published");
      setArchiveStatus("published");
      setSyncUiState("synced");
      if (data.commitSha) setLastSyncCommitSha(data.commitSha);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSync = async () => {
    const targetSlug = result?.slug ?? slug;
    if (!targetSlug) return;
    setPublishing(true);
    setError(null);
    setSyncUiState("syncing");
    try {
      const res = await adminFetch(
        `/api/admin/archive/${encodeURIComponent(targetSlug)}/sync`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string; commitSha?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Sync failed");
      }
      setSyncUiState("synced");
      if (data.commitSha) setLastSyncCommitSha(data.commitSha);
    } catch (e) {
      setSyncUiState("sync_failed");
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSlugSave = async () => {
    if (!draftId) return;
    setError(null);
    if (durableStorage && d1Archive) {
      try {
        const res = await adminFetch(
          `/api/admin/archive/artworks/${encodeURIComponent(draftId)}/validate-identity`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
          },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          errors?: string[];
          error?: string;
          slug?: string;
        };
        if (!res.ok || data.ok === false) {
          throw new Error(
            data.errors?.join("; ") || data.error || "Slug validation failed",
          );
        }
        if (data.slug) setSlug(data.slug);
        setSlugLocked(true);
        await saveDraft();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Slug validation failed");
      }
      return;
    }
    if (durableStorage) {
      setSlugLocked(true);
      await saveDraft();
      return;
    }
    try {
      const res = await adminFetch(
        `/api/admin/drafts/${encodeURIComponent(draftId)}/slug`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, lock: slugLocked }),
        },
      );
      const data = (await res.json()) as DraftResponse;
      if (!res.ok || !data.draft) {
        throw new Error(data.error ?? "Slug update failed");
      }
      applyDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Slug update failed");
    }
  };

  const updateMintField = (
    field: "platform" | "url" | "chain",
    value: string,
  ) => {
    setProvenance((prev) => {
      const current = firstMint(prev);
      return {
        ...prev,
        mint: [{ ...current, [field]: value }],
      };
    });
  };

  const mint = firstMint(provenance);
  const provenanceSlug = result?.slug ?? slug;

  const syncStatusMessage = (() => {
    if (syncUiState === "local_changed") {
      return "Local bundle updated. Sync to GitHub to deploy.";
    }
    if (syncUiState === "publish_pending") {
      return "Local bundle updated. Publish on the next step to promote lifecycle on GitHub.";
    }
    if (syncUiState === "syncing") return "Syncing to GitHub...";
    if (syncUiState === "synced" && lastSyncCommitSha) {
      return `Synchronized (${lastSyncCommitSha.slice(0, 7)}).`;
    }
    if (syncUiState === "synced") return "Synchronized to GitHub.";
    if (syncUiState === "sync_failed") return "Sync failed. Local archive is unchanged.";
    return null;
  })();

  const footerPrimary = resolveFooterPrimaryAction({
    durableStorage,
    step,
    steps: STEPS,
    commitCompleted,
    reviewBusy: committing || commitInFlight,
    reviewReady: canUpdateAndPublish({
      hasSourceFile: Boolean(sourceFile),
      hasPreparedLocal: Boolean(preparedLocal),
    }),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 border-b border-[var(--border)] pb-8">
        <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
          Archival accession
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-tight">
          {accessionId ? `Accession draft ${accessionId}` : "Accession draft"}
        </h1>
        <p className="mt-3 max-w-xl text-[0.88rem] leading-relaxed text-[var(--muted)]">
          {d1Archive || r2Archive ? (
            <>
              Canonical storage: Cloudflare D1 metadata and R2 binaries. Public
              pages read published revisions; the editable master stays private.
            </>
          ) : (
            <>
              Canonical source of truth:{" "}
              <code className="text-[0.8rem]">content/archive/</code>. Exports
              and public assets are derivatives.
            </>
          )}
        </p>
        <p className="mt-3 text-[0.68rem] tracking-[0.14em] uppercase text-[var(--muted)]">
          {formatWizardStatusHeader({
            draftId,
            draftStatus: status,
            archiveStatus,
          })}
        </p>
      </header>

      <nav
        className="mb-10 flex flex-wrap gap-2"
        aria-label="Accession steps"
      >
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            title={STEP_TOOLTIPS[label]}
            onClick={() => setStep(label)}
            className={`px-2 py-1 text-[0.58rem] tracking-[0.16em] uppercase border ${
              step === label
                ? "border-[var(--ink)] text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted)] opacity-60"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>

      {slug && (
        <div className="mb-6 grid gap-3 border border-[var(--border)] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block space-y-1">
            <span className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
              Accession slug
            </span>
            <input
              value={slug}
              title="Public path segment for this accession. Auto-generated from date and title unless locked."
              onChange={(e) => setSlug(normalizeArchiveSlug(e.target.value))}
              className="w-full border-b border-[var(--border)] bg-transparent py-1 text-[0.85rem] outline-none"
            />
          </label>
          <label
            title="Freeze the slug so changes to title or date no longer rewrite it automatically."
            className="flex items-center gap-2 text-[0.68rem] tracking-[0.12em] uppercase text-[var(--muted)]"
          >
            <input
              type="checkbox"
              checked={slugLocked}
              onChange={(e) => setSlugLocked(e.target.checked)}
            />
            Lock
          </label>
          <button
            type="button"
            title="Check the slug is allowed and not already used, then save it to this draft."
            onClick={handleSlugSave}
            className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase"
          >
            Validate
          </button>
        </div>
      )}

      {error && (
        <p className="mb-6 border border-red-900/30 bg-red-950/20 px-4 py-3 text-[0.8rem] text-red-200">
          {error}
        </p>
      )}

      {step === "Upload" && (
        <section className="space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            1. Upload source artwork
          </h2>
          {!sourceFile ? (
            <>
              <ImageDropZone
                key={uploadInputKey}
                dragOver={controller.dragOver}
                onDragOver={controller.setDragOver}
                onImport={handleSourceFile}
              />
              <p className="text-[0.75rem] text-[var(--muted)]">
                Select a high-resolution master. In durable mode the original
                stays in this browser until Review. No remote upload happens on
                select.
              </p>
            </>
          ) : (
            <>
              {(() => {
                const previewUrl =
                  resolveObjectUrlFromAnyTab(draftId || "pending-draft") ||
                  controller.artwork.imageSrc;
                const meta = buildSourcePreviewMeta(
                  sourceFile,
                  sourceDimensions,
                );
                const pipeline = deriveSourcePipelineStatus({
                  hasSourceFile: true,
                  hasPreparedLocal: Boolean(preparedLocal),
                  serverSourceKind: currentDraft?.source?.kind,
                  archiveStatus,
                  draftStatus: status,
                  commitCompleted,
                });
                return (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="relative aspect-square overflow-hidden border border-[var(--border)] bg-black/10">
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[0.75rem] text-[var(--muted)]">
                          Preview unavailable
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 text-[0.78rem]">
                      <div className="space-y-1 border border-[var(--border)] p-4">
                        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Source file
                        </p>
                        <p className="break-all">{meta.name}</p>
                        <p className="text-[var(--muted)]">{meta.sizeLabel}</p>
                        <p className="text-[var(--muted)]">{meta.typeLabel}</p>
                        {meta.width && meta.height ? (
                          <p className="text-[var(--muted)]">
                            {meta.width} × {meta.height}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2 border border-[var(--border)] p-4">
                        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Pipeline
                        </p>
                        {(
                          Object.keys(PIPELINE_STATUS_LABELS) as Array<
                            keyof typeof PIPELINE_STATUS_LABELS
                          >
                        ).map((key) => (
                          <p
                            key={key}
                            className={
                              pipeline[key]
                                ? "text-[var(--foreground)]"
                                : "text-[var(--muted)] opacity-50"
                            }
                          >
                            {PIPELINE_STATUS_LABELS[key]}
                            {pipeline[key] ? "" : " — not yet"}
                          </p>
                        ))}
                      </div>
                      <ImageDropZone
                        key={uploadInputKey}
                        compact
                        label="Replace source"
                        dragOver={controller.dragOver}
                        onDragOver={controller.setDragOver}
                        onImport={handleSourceFile}
                      />
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </section>
      )}

      {step === "Prepare" && (
        <section className="space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            2. Archival preparation
          </h2>
          <p className="text-[0.85rem] leading-relaxed text-[var(--muted)]">
            Prepare encodes an orientation-safe master locally in the browser.
            {durableStorage
              ? r2Archive
                ? " Binaries upload to R2 only on Review → Publish; revision metadata is written to D1."
                : " Nothing is written remotely until Review → Publish Artwork."
              : " Local/dev fallback may deposit to disk only when you continue past Prepare."}
          </p>
          <EmbeddedPreparePanel
            draft={currentDraft}
            previewSrc={controller.artwork.imageSrc}
            sourceFile={sourceFile}
            durableStorage={durableStorage}
            prepared={preparedLocal}
            sourceHydrating={sourceHydrating}
            serverSourceUnavailable={serverSourceUnavailable}
            onPreparedLocal={handlePreparedLocal}
            onError={(message) => setError(message || null)}
          />
        </section>
      )}

      {step === "Orientation" && (
        <section className="space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            3. Perceptual orientation
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="relative aspect-square border border-[var(--border)]">
              {controller.artwork.imageSrc ? (
                <PerceptionCanvas
                  artwork={controller.resolvedArtwork}
                  mode="editor-preview"
                />
              ) : (
                <ImportZone
                  compact
                  dragOver={controller.dragOver}
                  onDragOver={controller.setDragOver}
                  onImport={handleSourceFile}
                />
              )}
            </div>
            <div>
              <PerceptualStatesPanel controller={controller} />
              <BackgroundPanel controller={controller} />
            </div>
          </div>
        </section>
      )}

      {step === "Metadata" && (
        <section className="max-w-lg space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            4. Accession metadata
          </h2>
          {accessionId && (
            <p className="text-[0.75rem] text-[var(--muted)]">
              Accession{" "}
              <span className="font-mono text-[var(--foreground)]">{accessionId}</span>
              {" "}(allocated; not editable)
            </p>
          )}
          <MetadataPanelSection controller={controller} />
        </section>
      )}

      {step === "SEO" && (
        <section className="max-w-xl space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            SEO and archive description
          </h2>
          <p className="text-[0.85rem] leading-relaxed text-[var(--muted)]">
            Generated only from finalized metadata (title, year, process, and optional
            description). No invented facts. Review before publish; regenerating does
            not reprocess images.
          </p>
          {!isMetadataFinalized(controller.artwork.metadata) && (
            <p className="border border-[var(--border)] p-3 text-[0.78rem] text-[var(--muted)]">
              Complete title, year, and process on the Metadata step before generating SEO.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!slug || !isMetadataFinalized(controller.artwork.metadata)}
              className="border border-[var(--ink)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase disabled:opacity-40"
              onClick={() => {
                const generated = generateSeoFromMetadata({
                  slug,
                  metadata: {
                    ...controller.artwork.metadata,
                    accessionId: accessionId || controller.artwork.metadata.accessionId,
                  },
                });
                controller.setArtwork({
                  ...controller.artwork,
                  metadata: {
                    ...controller.artwork.metadata,
                    seo: generated,
                  },
                });
              }}
            >
              Generate SEO draft
            </button>
            {controller.artwork.metadata.seo && (
              <button
                type="button"
                className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
                onClick={() => {
                  const current = controller.artwork.metadata.seo as SeoMetadata;
                  controller.setArtwork({
                    ...controller.artwork,
                    metadata: {
                      ...controller.artwork.metadata,
                      seo: { ...current, reviewed: true },
                    },
                  });
                }}
              >
                Mark reviewed
              </button>
            )}
          </div>
          {controller.artwork.metadata.seo && (
            <div className="space-y-4 border border-[var(--border)] p-4">
              <label className="block text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                Page title
                <input
                  className="mt-1 w-full border-b border-[var(--border)] bg-transparent py-2 text-sm normal-case tracking-normal outline-none"
                  value={controller.artwork.metadata.seo.pageTitle}
                  onChange={(e) => {
                    const seo = {
                      ...controller.artwork.metadata.seo!,
                      pageTitle: e.target.value,
                      ogTitle: e.target.value,
                      reviewed: false,
                    };
                    controller.setArtwork({
                      ...controller.artwork,
                      metadata: { ...controller.artwork.metadata, seo },
                    });
                  }}
                />
              </label>
              <label className="block text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                Description
                <textarea
                  rows={4}
                  className="mt-1 w-full border border-[var(--border)] bg-transparent p-2 text-sm normal-case tracking-normal outline-none"
                  value={controller.artwork.metadata.seo.description}
                  onChange={(e) => {
                    const seo = {
                      ...controller.artwork.metadata.seo!,
                      description: e.target.value,
                      ogDescription: e.target.value,
                      reviewed: false,
                    };
                    controller.setArtwork({
                      ...controller.artwork,
                      metadata: { ...controller.artwork.metadata, seo },
                    });
                  }}
                />
              </label>
              <p className="text-[0.72rem] text-[var(--muted)]">
                Status:{" "}
                {controller.artwork.metadata.seo.reviewed
                  ? "Reviewed"
                  : "Draft — mark reviewed when ready"}
              </p>
              <pre className="max-h-40 overflow-auto text-[0.68rem] text-[var(--muted)]">
                {controller.artwork.metadata.seo.archiveMarkdown}
              </pre>
            </div>
          )}
        </section>
      )}

      {step === "Generate" && (
        <section className="space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            {isExistingArchive
              ? "5–7. Regenerate archive bundle"
              : "5–7. Generate archive bundle"}
          </h2>
          <p className="text-[0.85rem] text-[var(--muted)]">
            {durableStorage
              ? isExistingArchive
                ? "Regenerate writing uses the same browser Commit path (five derivatives + metadata). Prefer Commit on Prepare for first-time deposits."
                : "If you already Committed on Prepare, Publish is next. Generate here re-runs the browser Commit bundle from the in-tab source."
              : isExistingArchive
                ? deployUsesSync
                  ? "Updates the local archive bundle from your edits. The deposited original source is preserved. This does not sync to GitHub until you explicitly sync."
                  : "Updates the local archive bundle from your edits. The deposited original source is preserved. Use Publish on the next step to promote lifecycle on GitHub."
                : "Local fallback deposits the browser source then runs server generate. Durable Preview should Commit from Prepare instead."}
          </p>
          {durableStorage && (
            <p className="border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[0.72rem] text-amber-100/90">
              Browser MVP: Commit writes metadata, states, notes, five public
              derivatives, draft source, and prepared master. Omits perception.html
              and manifest.json (mint-package excluded until full regenerate). Public
              View may 404 until redeploy.
            </p>
          )}
          <button
            type="button"
            disabled={
              generating ||
              !draftId ||
              isRegenerateBlocked(status, archiveStatus)
            }
            title={
              isRegenerateBlocked(status, archiveStatus)
                ? "Withdrawn archives cannot be regenerated. Restore first."
                : isExistingArchive
                  ? "Regenerate archive files locally from edited metadata and orientation."
                  : "Generate archive files locally from the prepared source, orientation, and metadata."
            }
            onClick={handleGenerate}
            className="border border-[var(--ink)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
          >
            {generating
              ? isExistingArchive
                ? "Regenerating..."
                : "Generating..."
              : isExistingArchive
                ? "Regenerate archive bundle"
                : "Generate archive bundle"}
          </button>
          {syncStatusMessage && (
            <p className="text-[0.78rem] text-[var(--muted)]">{syncStatusMessage}</p>
          )}
          {result && (
            <div className="mt-6 space-y-2 border border-[var(--border)] p-4 text-[0.78rem]">
              <p className="tracking-wide uppercase text-[var(--muted)]">
                Bundle written
              </p>
              <ul className="max-h-48 overflow-y-auto font-mono text-[0.7rem] opacity-80">
                {result.files.map((f) => (
                  <li key={f.path}>
                    {f.path} ({f.bytes} B)
                  </li>
                ))}
              </ul>
              {result.warnings.map((w) => (
                <p key={w} className="text-amber-200/80">
                  {w}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {step === "Publish" && (
        <section className="space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            {deployUsesSync
              ? "8. Sync to GitHub"
              : "8. Commit to archive repository"}
          </h2>
          {!result ? (
            <p className="text-[0.85rem] text-[var(--muted)]">
              {isExistingArchive
                ? "Regenerate the bundle first."
                : "Generate the bundle first."}
            </p>
          ) : (
            <>
              <p className="text-[0.85rem] text-[var(--muted)]">
                {deployUsesSync
                  ? "Push the current content/archive and public/archive bundle to GitHub. This does not change lifecycle status."
                  : "Marks the local record published, then pushes content/archive and public/archive to GitHub when GITHUB_ARCHIVE_TOKEN is configured. Vercel redeploys on push."}
              </p>
              <button
                type="button"
                disabled={publishing}
                title={
                  deployUsesSync
                    ? "Synchronize the regenerated archive bundle to GitHub for deployment."
                    : "Push content/archive and public/archive to the linked Git repository for deployment."
                }
                onClick={deployUsesSync ? handleSync : handlePublish}
                className="border border-[var(--border)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
              >
                {publishing
                  ? deployUsesSync
                    ? "Syncing..."
                    : "Publishing..."
                  : deployUsesSync
                    ? "Sync to GitHub"
                    : "Commit to GitHub"}
              </button>
              {syncStatusMessage && (
                <p className="text-[0.78rem] text-[var(--muted)]">{syncStatusMessage}</p>
              )}
            </>
          )}
        </section>
      )}

      {step === "Provenance" && (
        <section className="max-w-lg space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            9. Provenance record
          </h2>
          <p className="text-[0.82rem] text-[var(--muted)]">
            Mint links are archival provenance, not primary identity. Leave blank until
            minted.
          </p>
          <label className="block space-y-1">
            <span className="text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              Platform
            </span>
            <input
              className="w-full border-b border-[var(--border)] bg-transparent py-2 outline-none"
              value={mint.platform}
              onChange={(e) => updateMintField("platform", e.target.value)}
              placeholder="Transient Labs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              URL
            </span>
            <input
              className="w-full border-b border-[var(--border)] bg-transparent py-2 outline-none"
              value={mint.url}
              onChange={(e) => updateMintField("url", e.target.value)}
              placeholder="https://"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              Chain
            </span>
            <input
              className="w-full border-b border-[var(--border)] bg-transparent py-2 outline-none"
              value={mint.chain}
              onChange={(e) => updateMintField("chain", e.target.value)}
              placeholder="Ethereum"
            />
          </label>
          {provenanceSlug && mint.url.trim() && !durableStorage && (
            <button
              type="button"
              disabled={publishing}
              title="Write mint provenance links into the published archive metadata record."
              onClick={async () => {
                setPublishing(true);
                setError(null);
                try {
                  const res = await adminFetch("/api/admin/archive/provenance", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug: provenanceSlug, provenance }),
                  });
                  const data = (await res.json()) as { error?: string };
                  if (!res.ok) throw new Error(data.error ?? "Update failed");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Update failed");
                } finally {
                  setPublishing(false);
                }
              }}
              className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
            >
              Save provenance to record
            </button>
          )}
          {durableStorage && (
            <p className="text-[0.75rem] text-[var(--muted)]">
              Provenance stays local until Publish Artwork on Review.
            </p>
          )}
        </section>
      )}

      {step === "Visibility" && (
        <section className="max-w-lg space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            Publication visibility
          </h2>
          <p className="text-[0.82rem] text-[var(--muted)]">
            Stored in metadata on Publish. Opening or editing locally does not
            change public visibility.
          </p>
          {(
            [
              {
                value: "published" as const,
                label: "Published",
                help: "Listed on the public archive after publish.",
              },
              {
                value: "generated" as const,
                label: "Generated (admin only)",
                help: d1Archive || r2Archive
                  ? "Record stays admin-only until you publish it."
                  : "Files exist in GitHub; public site filters it out until published.",
              },
              {
                value: "hidden" as const,
                label: "Hidden",
                help: "Retained in the archive but not shown publicly.",
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 border border-[var(--border)] p-3"
            >
              <input
                type="radio"
                name="intended-visibility"
                checked={intendedStatus === option.value}
                onChange={() => setIntendedStatus(option.value)}
              />
              <span>
                <span className="block text-[0.78rem] tracking-wide uppercase">
                  {option.label}
                </span>
                <span className="mt-1 block text-[0.72rem] text-[var(--muted)]">
                  {option.help}
                </span>
              </span>
            </label>
          ))}
        </section>
      )}

      {step === "Review" && (
        <section className="space-y-6">
          <h2 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            Review and publish
          </h2>
          {durableStorage && (
            <p className="border border-[var(--border)] p-3 text-[0.78rem] text-[var(--muted)]">
              SEO:{" "}
              {!controller.artwork.metadata.seo
                ? "Not generated (publish allowed; public page will use basic title metadata)."
                : controller.artwork.metadata.seo.reviewed
                  ? "Reviewed and ready to store with the working revision."
                  : "Draft generated but not marked reviewed."}
            </p>
          )}
          {(() => {
            const reviewReady = canUpdateAndPublish({
              hasSourceFile: Boolean(sourceFile),
              hasPreparedLocal: Boolean(preparedLocal),
            });
            const submitState = resolveReviewSubmitState({
              commitCompleted,
              committing,
              commitInFlight,
              hasCommitError: Boolean(commitError),
              reviewReady,
            });
            const busy = submitState === "updating";
            return (
              <div className="space-y-4 border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                    Submission · {submitState}
                    {busy || commitPhase !== "idle"
                      ? ` · ${commitPhaseLabel(commitPhase)}${
                          r2Archive || d1Archive
                            ? " (R2 + D1)"
                            : " (durable)"
                        }`
                      : ""}
                  </p>
                </div>

                {submitState === "completed" && lastCommittedSha ? (
                  <div className="space-y-3">
                    <p className="text-[0.85rem] text-[var(--muted)]">
                      {r2Archive || d1Archive ? (
                        <>
                          Revision published
                          {result?.slug ? ` for ${result.slug}` : ""}.
                          {lastCommittedSha
                            ? ` Reference ${lastCommittedSha.slice(0, 7)}.`
                            : ""}
                        </>
                      ) : (
                        <>
                          Revision stored
                          {result?.slug ? ` for ${result.slug}` : ""}.
                          Reference{" "}
                          <code className="text-[0.8rem]">
                            {lastCommittedSha.slice(0, 7)}
                          </code>
                          .
                        </>
                      )}
                    </p>
                    {result && (
                      <ul className="max-h-40 overflow-y-auto font-mono text-[0.7rem] opacity-80">
                        {result.files.map((f) => (
                          <li key={f.path}>
                            {f.path} ({f.bytes} B)
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 text-[0.78rem] sm:grid-cols-2">
                      <div>
                        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Artwork
                        </p>
                        <p>
                          {controller.artwork.metadata.title || "(untitled)"}
                        </p>
                        <p className="text-[var(--muted)]">{accessionId}</p>
                        <p className="text-[var(--muted)]">slug: {slug}</p>
                      </div>
                      <div>
                        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Visibility
                        </p>
                        <p>{intendedStatus}</p>
                        <p className="mt-2 text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Mode
                        </p>
                        <p>
                          {isExistingArchive ? "Revision" : "New accession"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Provenance
                        </p>
                        <p>
                          mint: {mint.platform || "(none)"}
                          {mint.url ? ` — ${mint.url}` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                          Sizes
                        </p>
                        <p>
                          Source:{" "}
                          {sourceFile
                            ? formatByteSize(sourceFile.size)
                            : "missing"}
                          {sourceFile && sourceFile.size > MAX_SOURCE_BYTES
                            ? " (over limit)"
                            : ""}
                        </p>
                        <p>
                          Prepared:{" "}
                          {preparedLocal
                            ? formatByteSize(preparedLocal.blob.size)
                            : "not prepared"}
                        </p>
                        <p className="text-[var(--muted)]">
                          {r2Archive || d1Archive
                            ? `Original master limit ${formatByteSize(MAX_SOURCE_BYTES)}`
                            : `Binary budget ${formatByteSize(MAX_BUNDLE_BINARY_BYTES)} (platform ~4.5 MB)`}
                        </p>
                      </div>
                    </div>
                    {(preparedLocal?.objectUrl ||
                      controller.artwork.imageSrc) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          preparedLocal?.objectUrl ||
                          controller.artwork.imageSrc
                        }
                        alt=""
                        className="max-h-64 w-auto border border-[var(--border)] object-contain"
                      />
                    )}
                  </>
                )}

                {submitState === "failed" && commitError && (
                  <div className="space-y-2 border border-red-900/30 bg-red-950/20 p-3 text-[0.8rem] text-red-200">
                    <p>{commitError}</p>
                    {commitPhase === "failed_metadata" && (
                      <p className="text-[0.72rem] text-[var(--muted)]">
                        Media may already be stored in R2. Revision metadata was
                        not written. Retry after fixing the error.
                      </p>
                    )}
                  </div>
                )}

                {submitState !== "completed" && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      commitCompleted ||
                      !draftId ||
                      (submitState === "ready" && !reviewReady)
                    }
                    title={
                      isExistingArchive
                        ? "Validate and publish an updated working revision."
                        : "Validate and publish this artwork."
                    }
                    onClick={() => {
                      void handleCommitAccession();
                    }}
                    className="border border-[var(--ink)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
                  >
                    {reviewSubmitLabel(submitState, isExistingArchive)}
                  </button>
                )}
              </div>
            );
          })()}
          {result?.warnings?.map((w) => (
            <p key={w} className="text-[0.72rem] text-amber-200/80">
              {w}
            </p>
          ))}
        </section>
      )}

      <footer className="mt-12 flex justify-between border-t border-[var(--border)] pt-8">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex <= 0 || commitCompleted}
          title="Return to the previous accession step without discarding draft changes."
          className="text-[0.68rem] tracking-[0.14em] uppercase opacity-50 disabled:opacity-20"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => {
            if (footerPrimary.action === "done") {
              router.push(WIZARD_DONE_HREF);
              return;
            }
            if (footerPrimary.action === "next") goNext();
          }}
          disabled={footerPrimary.disabled}
          title={
            footerPrimary.action === "done"
              ? "Return to the admin archive list."
              : footerPrimary.action === "noop"
                ? "Use the publish action in the Review panel above."
                : "Continue to the next accession step."
          }
          className="border border-[var(--ink)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
        >
          {footerPrimaryLabel({
            steps: STEPS,
            step,
            isRevision: isExistingArchive,
            completed: commitCompleted,
          })}
        </button>
      </footer>
    </div>
  );
}
