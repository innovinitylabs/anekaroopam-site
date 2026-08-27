"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  buildArchiveSlug,
  emptyProvenance,
  normalizeArchiveSlug,
  type AccessionDraft,
  type ProvenanceRecord,
} from "@/lib/archive/schema";
import {
  installUploadRegistryBridge,
  registerTransientUpload,
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

type DraftResponse = { draft?: AccessionDraft; error?: string };

const STEP_TOOLTIPS: Record<StepId, string> = {
  Upload:
    "Deposit the original master image into this draft's preserved source folder.",
  Prepare:
    "Normalize rotation and write an orientation-safe prepared master into working/.",
  Orientation:
    "Define perceptual states, snap behavior, and the viewing background for export.",
  Metadata:
    "Edit accession title, date, process, and other archival metadata fields.",
  Generate:
    "Write metadata, states, derivatives, manifest, and standalone HTML to the archive.",
  Publish:
    "Commit the generated archive bundle to GitHub when repository credentials are set.",
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

  const initialArtwork = useMemo(() => defaultOrientationArtwork(), []);

  const [artwork, setArtwork] = useState<PerceptionArtwork>(initialArtwork);
  const controller = useOrientationArtwork({
    value: artwork,
    onChange: setArtwork,
    uploadDraftId: draftId || "pending-draft",
  });

  const applyDraft = useCallback((draft: AccessionDraft) => {
    const objectUrl = resolveObjectUrlFromAnyTab(draft.draftId);
    setDraftId(draft.draftId);
    setAccessionId(draft.accessionId);
    setStatus(draft.status);
    setCurrentDraft(draft);
    setSlug(draft.slug);
    setSlugLocked(draft.slugLocked);
    setProvenance(draft.provenance);
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
      setDraftLoaded(false);
      try {
        const res = initialDraftId
          ? await fetch(`/api/admin/drafts/${encodeURIComponent(initialDraftId)}`)
          : await fetch("/api/admin/drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
        const data = (await res.json()) as DraftResponse;
        if (!res.ok || !data.draft) {
          throw new Error(data.error ?? "Draft could not be loaded");
        }
        if (!cancelled) applyDraft(data.draft);
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

  const saveDraft = useCallback(async () => {
    if (!draftLoaded || !draftId) return null;
    const res = await fetch(`/api/admin/drafts/${encodeURIComponent(draftId)}`, {
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
      if (!draftId) return;
      const entry = registerTransientUpload(draftId, file);
      setSourceFile(file);
      setArtwork((prev) =>
        hydrateArtworkPreview(
          {
            ...prev,
            metadata: {
              ...prev.metadata,
              accessionId,
              title:
                prev.metadata.title ||
                file.name.replace(/\.[^.]+$/, ""),
            },
          },
          entry.objectUrl,
        ),
      );
      setUploadInputKey((k) => k + 1);
      const form = new FormData();
      form.append("source", file);
      const res = await fetch(
        `/api/admin/drafts/${encodeURIComponent(draftId)}/source`,
        { method: "POST", body: form },
      );
      const data = (await res.json()) as DraftResponse;
      if (!res.ok || !data.draft) {
        setError(data.error ?? "Source could not be preserved");
      } else {
        applyDraft(data.draft);
      }
      setStep("Prepare");
    },
    [accessionId, applyDraft, draftId],
  );

  const handleGenerate = async () => {
    if (!draftId) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      await saveDraft();
      const res = await fetch(
        `/api/admin/drafts/${encodeURIComponent(draftId)}/generate`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        slug?: string;
        files?: { path: string; bytes: number }[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Generation failed");
      }
      setResult({
        slug: data.slug ?? slug,
        files: data.files ?? [],
        warnings: data.warnings ?? [],
      });
      setStatus("generated");
      setStep("Publish");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!result?.slug) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/archive/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: result.slug, draftId }),
      });
      const data = (await res.json()) as { error?: string; commitSha?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Publish failed");
      }
      setStatus("published");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSlugSave = async () => {
    if (!draftId) return;
    setError(null);
    try {
      const res = await fetch(
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
          {draftId || "Preparing draft"} · {status}
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
            Deposit a high-resolution master for archival encoding. Source file is
            preserved under the draft and mirrored in memory for browser preview.
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
            Prepare runs inside this draft and writes canonical working files under
            <code className="ml-1 text-[0.8rem]">content/drafts/{draftId}/working/</code>.
          </p>
          <EmbeddedPreparePanel
            draft={currentDraft}
            previewSrc={controller.artwork.imageSrc}
            onPrepared={applyDraft}
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
            5–7. Generate archive bundle
          </h2>
          <p className="text-[0.85rem] text-[var(--muted)]">
            Writes the local archive bundle: metadata, states, notes, perception.html,
            public derivatives, original source/, and prepared/. Marks the record
            generated. This is not a GitHub publish; the work can appear on this
            local site until you commit.
          </p>
          <button
            type="button"
            disabled={generating || !draftId}
            title="Generate archive files locally from the prepared source, orientation, and metadata."
            onClick={handleGenerate}
            className="border border-[var(--ink)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
          >
            {generating ? "Generating..." : "Generate archive bundle"}
          </button>
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
            8. Commit to archive repository
          </h2>
          {!result ? (
            <p className="text-[0.85rem] text-[var(--muted)]">
              Generate the bundle first.
            </p>
          ) : (
            <>
              <p className="text-[0.85rem] text-[var(--muted)]">
                Marks the local record published, then pushes content/archive and
                public/archive to GitHub when GITHUB_ARCHIVE_TOKEN is configured.
                Vercel redeploys on push.
              </p>
              <button
                type="button"
                disabled={publishing}
                title="Push content/archive and public/archive to the linked Git repository for deployment."
                onClick={handlePublish}
                className="border border-[var(--border)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
              >
                {publishing ? "Publishing..." : "Commit to GitHub"}
              </button>
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
          {result?.slug && mint.url.trim() && (
            <button
              type="button"
              disabled={publishing}
              title="Write mint provenance links into the published archive metadata record."
              onClick={async () => {
                setPublishing(true);
                setError(null);
                try {
                  const res = await fetch("/api/admin/archive/provenance", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug: result.slug, provenance }),
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
