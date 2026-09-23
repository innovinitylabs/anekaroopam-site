"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
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
import type { PerceptionArtwork } from "@/lib/perception/types";

const STEPS = [
  "Upload",
  "Prepare",
  "Orientation",
  "Metadata",
  "Generate",
  "Publish",
  "Provenance",
] as const;

type StepId = (typeof STEPS)[number];

type DraftResponse = {
  draft?: AccessionDraft;
  archiveStatus?: DraftStatus | null;
  error?: string;
};

const STEP_TOOLTIPS: Record<StepId, string> = {
  Upload:
    "Select the original master. It stays in this browser tab until Commit; only a metadata draft is created.",
  Prepare:
    "Encode an orientation-safe prepared master locally in the browser. Commit only when you choose.",
  Orientation:
    "Define perceptual states, snap behavior, and the viewing background for export.",
  Metadata:
    "Edit accession title, date, process, and other archival metadata fields.",
  Generate:
    "Optional re-run of the browser Commit bundle, or local server generate when durable mode is off.",
  Publish:
    "Promote or sync the generated archive on GitHub when repository credentials are set.",
  Provenance:
    "Record mint, auction, and marketplace links after the work is published or minted.",
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
}: {
  initialDraftId?: string;
}) {
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
  const [preparedLocal, setPreparedLocal] = useState<LocalPreparedMaster | null>(
    null,
  );
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/session", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          durableStorage?: boolean;
        };
        if (!cancelled) setDurableStorage(Boolean(data.durableStorage));
      })
      .catch(() => {
        if (!cancelled) setDurableStorage(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!initialDraftId) {
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
  }, [applyDraft, initialDraftId]);

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
  }, [draftId, draftLoaded, slug]);

  const saveDraft = useCallback(async () => {
    if (!draftLoaded || !draftId) return null;
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
  }, [accessionId, controller.artwork, draftId, draftLoaded, provenance, slug, slugLocked]);

  useEffect(() => {
    if (!draftLoaded || !draftId) return;
    const timeout = window.setTimeout(() => {
      saveDraft().catch((e) => {
        setError(e instanceof Error ? e.message : "Draft autosave failed");
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [draftId, draftLoaded, saveDraft]);

  const stepIndex = STEPS.indexOf(step);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleSourceFile = useCallback(
    async (file: File) => {
      setError(null);
      registerTransientUpload(draftId || "pending-draft", file);
      setSourceFile(file);
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
      draftId,
      preparedLocal,
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

  const handleCommitPrepared = useCallback(async () => {
    if (!draftId || !currentDraft) return;
    setCommitting(true);
    setError(null);
    setResult(null);
    try {
      const saved = await saveDraft();
      const draftForCommit = saved ?? currentDraft;
      const file = await resolveSourceBlob();
      if (!durableStorage) {
        throw new Error(
          "Durable GitHub storage is required for browser Commit. Use local Generate on non-durable environments.",
        );
      }
      const committed = await commitBrowserDurableBundle({
        draft: draftForCommit,
        sourceFile: file,
        prepared: preparedLocal,
        isExistingArchive,
        message: `archive: browser commit ${draftForCommit.slug}`,
      });
      setResult({
        slug: committed.slug,
        files: committed.files,
        warnings: committed.warnings,
      });
      applyDraft(committed.draft, file);
      setArchiveStatus(committed.archiveStatus);
      setStatus("generated");
      setLastSyncCommitSha(committed.commitSha);
      if (deployUsesSync) {
        setSyncUiState("local_changed");
      } else if (isExistingArchive) {
        setSyncUiState("publish_pending");
      } else {
        setSyncUiState("idle");
      }
      setStep("Publish");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }, [
    applyDraft,
    currentDraft,
    deployUsesSync,
    draftId,
    durableStorage,
    isExistingArchive,
    preparedLocal,
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
        const file = await resolveSourceBlob();
        const committed = await commitBrowserDurableBundle({
          draft: draftForGenerate,
          sourceFile: file,
          prepared: preparedLocal,
          isExistingArchive,
          message: `archive: browser generate ${draftForGenerate.slug}`,
        });
        setResult({
          slug: committed.slug,
          files: committed.files,
          warnings: committed.warnings,
        });
        applyDraft(committed.draft, file);
        setArchiveStatus(committed.archiveStatus);
        setLastSyncCommitSha(committed.commitSha);
        if (deployUsesSync) {
          setSyncUiState("local_changed");
        } else if (isExistingArchive) {
          setSyncUiState("publish_pending");
        } else {
          setStatus("generated");
          setSyncUiState("idle");
        }
        setStep("Publish");
        return;
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
          Canonical source of truth: <code className="text-[0.8rem]">content/archive/</code>.
          Exports and public assets are derivatives.
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
          <ImageDropZone
            key={uploadInputKey}
            dragOver={controller.dragOver}
            onDragOver={controller.setDragOver}
            onImport={handleSourceFile}
          />
          <p className="text-[0.75rem] text-[var(--muted)]">
            Select a high-resolution master. The original stays in this browser tab
            until you Commit after Prepare. A metadata-only draft is created so
            edits can autosave — the image bytes are not uploaded on Select.
          </p>
          {sourceFile && (
            <p className="text-[0.75rem] text-[var(--muted)]">
              Selected: {sourceFile.name} ({Math.round(sourceFile.size / 1024)} KB)
            </p>
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
              ? " Nothing is written to GitHub until you click Commit."
              : " Local/dev fallback may deposit to disk only when you continue past Prepare."}
          </p>
          <EmbeddedPreparePanel
            draft={currentDraft}
            previewSrc={controller.artwork.imageSrc}
            sourceFile={sourceFile}
            durableStorage={durableStorage}
            prepared={preparedLocal}
            onPreparedLocal={handlePreparedLocal}
            onCommit={() => {
              void handleCommitPrepared();
            }}
            committing={committing}
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
          <MetadataPanelSection controller={controller} />
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
          {provenanceSlug && mint.url.trim() && (
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
        </section>
      )}

      <footer className="mt-12 flex justify-between border-t border-[var(--border)] pt-8">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          title="Return to the previous accession step without discarding draft changes."
          className="text-[0.68rem] tracking-[0.14em] uppercase opacity-50 disabled:opacity-20"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={stepIndex >= STEPS.length - 1}
          title="Advance to the next accession step. Draft changes autosave in the background."
          className="text-[0.68rem] tracking-[0.14em] uppercase"
        >
          Next
        </button>
      </footer>
    </div>
  );
}
