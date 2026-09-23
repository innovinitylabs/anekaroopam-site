"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import { encodeBrowserPreparedMaster } from "@/lib/archive/browser-image-pipeline";
import { useState } from "react";
import type { AccessionDraft } from "@/lib/archive/schema";
import { AccessionDraftSchema } from "@/lib/archive/schema";
import { resolveObjectUrlFromAnyTab } from "@/lib/archive/transient-upload-registry";

export function EmbeddedPreparePanel({
  draft,
  previewSrc,
  sourceFile,
  durableStorage = false,
  onPrepared,
  onError,
}: {
  draft: AccessionDraft | null;
  previewSrc?: string;
  sourceFile?: File | null;
  durableStorage?: boolean;
  onPrepared: (draft: AccessionDraft) => void;
  onError: (message: string) => void;
}) {
  const [preparing, setPreparing] = useState(false);
  const hasSource = draft?.source.kind === "original" && draft.source.storedFilename;
  const prepared = Boolean(draft?.processing.preparedSource);

  async function resolveSourceBlob(): Promise<Blob> {
    if (sourceFile) return sourceFile;
    if (previewSrc) {
      const res = await fetch(previewSrc);
      if (res.ok) return res.blob();
    }
    if (draft?.draftId) {
      const objectUrl = resolveObjectUrlFromAnyTab(draft.draftId);
      if (objectUrl) {
        const res = await fetch(objectUrl);
        if (res.ok) return res.blob();
      }
    }
    throw new Error(
      "Source image is not available in this browser tab. Re-upload the master, then prepare again.",
    );
  }

  async function runBrowserPrepare() {
    if (!draft) return;
    setPreparing(true);
    onError("");
    try {
      const sourceBlob = await resolveSourceBlob();
      const encoded = await encodeBrowserPreparedMaster(sourceBlob);
      const preparedAt = new Date().toISOString();
      const updated = AccessionDraftSchema.parse({
        ...draft,
        processing: {
          preparedSource: "working/master-prepared.avif",
          preparedAt,
          prepareVersion: "browser-avif-v1",
        },
        status: "prepared",
        preparedAt,
        updatedAt: preparedAt,
      });

      const form = new FormData();
      form.set("slug", updated.slug);
      form.set("draftId", updated.draftId);
      form.set("message", `draft: browser prepare ${updated.draftId}`);
      form.set(
        `path:content/drafts/${updated.draftId}/draft.json`,
        `${JSON.stringify(updated, null, 2)}\n`,
      );
      form.set(
        `path:content/drafts/${updated.draftId}/states.json`,
        `${JSON.stringify(
          {
            version: updated.version,
            draftId: updated.draftId,
            slug: updated.slug,
            perception: {
              states: updated.artwork.states,
              background: updated.artwork.background,
              initialAngle: updated.artwork.initialAngle,
              snapToState: updated.artwork.snapToState,
              showMetadataOverlay: updated.artwork.showMetadataOverlay,
              overlayFields: updated.artwork.overlayFields,
            },
            updatedAt: updated.updatedAt,
          },
          null,
          2,
        )}\n`,
      );
      form.append(
        "file",
        new File(
          [encoded.blob],
          `content/drafts/${updated.draftId}/working/master-prepared.avif`,
          { type: "image/avif" },
        ),
      );

      const res = await adminFetch("/api/admin/archive/commit-bundle", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Browser prepare commit failed");
      }
      onPrepared(updated);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Prepare failed");
    } finally {
      setPreparing(false);
    }
  }

  async function runPrepare() {
    if (!draft) return;
    if (durableStorage) {
      await runBrowserPrepare();
      return;
    }
    setPreparing(true);
    onError("");
    try {
      const res = await adminFetch(
        `/api/admin/drafts/${encodeURIComponent(draft.draftId)}/prepare`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        draft?: AccessionDraft;
        error?: string;
      };
      if (!res.ok || !data.draft) {
        throw new Error(data.error ?? "Prepare failed");
      }
      onPrepared(data.draft);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Prepare failed");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="border border-[var(--border)] p-4">
        <div className="relative aspect-square overflow-hidden bg-black/10">
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-[0.78rem] text-[var(--muted)]">
              Preserved draft source is available to the server. Re-upload only if this
              browser tab needs a visual preview.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5 text-[0.78rem]">
        <div className="space-y-2 border border-[var(--border)] p-4">
          <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Canonical preparation
          </p>
          <p className="leading-relaxed text-[var(--muted)]">
            {durableStorage
              ? "Encodes an orientation-safe prepared master in the browser and commits it to the draft working path on GitHub (no server Sharp)."
              : "Normalizes rotation and encodes an orientation-safe prepared master into the draft working directory."}
          </p>
          <button
            type="button"
            onClick={runPrepare}
            disabled={!draft || !hasSource || preparing}
            title={
              prepared
                ? "Regenerate master-prepared.avif from the preserved draft source."
                : "Normalize rotation and encode master-prepared.avif into the draft working directory."
            }
            className="mt-2 border border-[var(--ink)] px-4 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
          >
            {preparing
              ? "Preparing..."
              : prepared
                ? "Reprepare working master"
                : "Prepare working master"}
          </button>
        </div>

        <div className="space-y-2 border border-[var(--border)] p-4">
          <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Preparation state
          </p>
          <p>Source: {hasSource ? "preserved" : "missing"}</p>
          <p>Prepared: {prepared ? "yes" : "not yet"}</p>
          <p className="break-all text-[var(--muted)]">
            {draft?.processing.preparedSource ??
              "content/drafts/{draftId}/working/master-prepared.avif"}
          </p>
          {durableStorage && (
            <p className="text-[var(--muted)]">
              Mode: browser-first GitHub commit
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
