"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import { useState } from "react";
import type { AccessionDraft } from "@/lib/archive/schema";

export function EmbeddedPreparePanel({
  draft,
  previewSrc,
  onPrepared,
  onError,
}: {
  draft: AccessionDraft | null;
  previewSrc?: string;
  onPrepared: (draft: AccessionDraft) => void;
  onError: (message: string) => void;
}) {
  const [preparing, setPreparing] = useState(false);
  const hasSource = draft?.source.kind === "original" && draft.source.storedFilename;
  const prepared = Boolean(draft?.processing.preparedSource);

  async function runPrepare() {
    if (!draft) return;
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
            Normalizes rotation and encodes an orientation-safe prepared master into
            the draft working directory.
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
            {preparing ? "Preparing..." : prepared ? "Reprepare working master" : "Prepare working master"}
          </button>
        </div>

        <div className="space-y-2 border border-[var(--border)] p-4">
          <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Preparation state
          </p>
          <p>Source: {hasSource ? "preserved" : "missing"}</p>
          <p>Prepared: {prepared ? "yes" : "not yet"}</p>
          <p className="break-all text-[var(--muted)]">
            {draft?.processing.preparedSource ?? "content/drafts/{draftId}/working/master-prepared.avif"}
          </p>
        </div>

        <div className="space-y-2 border border-[var(--border)] p-4">
          <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Derivative plan
          </p>
          <p>thumb.jpg: archive grid</p>
          <p>preview.webp / preview.avif: public browsing</p>
          <p>artwork.avif: intentional full artwork display</p>
        </div>
      </div>
    </div>
  );
}
