"use client";

import {
  prepareMasterLocally,
  revokePreparedPreview,
  type LocalPreparedMaster,
} from "@/lib/archive/browser-durable-commit";
import { useState } from "react";
import type { AccessionDraft } from "@/lib/archive/schema";
import {
  resolveFileFromAnyTab,
  resolveObjectUrlFromAnyTab,
} from "@/lib/archive/transient-upload-registry";

export function EmbeddedPreparePanel({
  draft,
  previewSrc,
  sourceFile,
  durableStorage = false,
  prepared,
  onPreparedLocal,
  onCommit: _onCommit,
  committing = false,
  onError,
}: {
  draft: AccessionDraft | null;
  previewSrc?: string;
  sourceFile?: File | null;
  durableStorage?: boolean;
  prepared: LocalPreparedMaster | null;
  onPreparedLocal: (prepared: LocalPreparedMaster) => void;
  onCommit: () => void;
  committing?: boolean;
  onError: (message: string) => void;
}) {
  void _onCommit;
  const [preparing, setPreparing] = useState(false);
  const browserSource =
    sourceFile ??
    (draft?.draftId ? resolveFileFromAnyTab(draft.draftId) : null) ??
    null;
  const hasBrowserSource = Boolean(browserSource || previewSrc);
  const serverSource =
    draft?.source.kind === "original" && Boolean(draft.source.storedFilename);

  async function resolveSourceBlob(): Promise<Blob> {
    if (browserSource) return browserSource;
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
      "Source image is not available in this browser tab. Re-select the master on Upload, then prepare again.",
    );
  }

  /** Browser-first: encode locally only — no upload, commit-bundle, or Sharp. */
  async function runLocalPrepare() {
    if (!draft) return;
    setPreparing(true);
    onError("");
    try {
      const sourceBlob = await resolveSourceBlob();
      revokePreparedPreview(prepared);
      const next = await prepareMasterLocally(sourceBlob);
      onPreparedLocal(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Prepare failed");
    } finally {
      setPreparing(false);
    }
  }

  const displaySrc = prepared?.objectUrl || previewSrc;
  const canPrepare =
    Boolean(draft) && hasBrowserSource && !preparing && !committing;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="border border-[var(--border)] p-4">
        <div className="relative aspect-square overflow-hidden bg-black/10">
          {displaySrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displaySrc}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-[0.78rem] text-[var(--muted)]">
              Select a master on Upload. The original stays in this browser tab
              until you Commit.
            </div>
          )}
        </div>
        {prepared && (
          <p className="mt-3 text-[0.72rem] text-[var(--muted)]">
            Local prepared master ready ({prepared.width}×{prepared.height} AVIF,
            {Math.round(prepared.blob.size / 1024)} KB). Not committed yet.
          </p>
        )}
      </div>

      <div className="space-y-5 text-[0.78rem]">
        <div className="space-y-2 border border-[var(--border)] p-4">
          <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Local preparation
          </p>
          <p className="leading-relaxed text-[var(--muted)]">
            {durableStorage
              ? "Encodes an orientation-safe prepared master in the browser only. Nothing is uploaded or committed until you click Commit."
              : "Encodes a local preview master in the browser. Server Sharp runs only later on Generate (local non-durable fallback)."}
          </p>
          <button
            type="button"
            onClick={() => {
              void runLocalPrepare();
            }}
            disabled={!canPrepare}
            title={
              hasBrowserSource
                ? "Encode prepared master locally from the browser File."
                : "Select a source image on Upload first."
            }
            className="mt-2 border border-[var(--ink)] px-4 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
          >
            {preparing
              ? "Preparing..."
              : prepared
                ? "Reprepare locally"
                : "Prepare working master"}
          </button>
        </div>

        {durableStorage && (
          <div className="space-y-2 border border-[var(--border)] p-4">
            <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
              Commit
            </p>
            <p className="leading-relaxed text-[var(--muted)]">
              Preparation stays local. Advance to Review, then use Commit
              Accession (or Commit Revision) for the single intentional GitHub
              write.
            </p>
          </div>
        )}

        <div className="space-y-2 border border-[var(--border)] p-4">
          <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Preparation state
          </p>
          <p>Browser source: {hasBrowserSource ? "present" : "missing"}</p>
          <p>Server source: {serverSource ? "deposited" : "not deposited"}</p>
          <p>Prepared locally: {prepared ? "yes" : "not yet"}</p>
          {durableStorage && (
            <p className="text-[var(--muted)]">Mode: browser-first (no Sharp)</p>
          )}
        </div>
      </div>
    </div>
  );
}
