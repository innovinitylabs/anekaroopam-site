"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFetch } from "@/components/admin/admin-fetch";
import type { WorkerArtwork } from "@/lib/archive/worker-client";

export type ArtworkReadiness = {
  ok: boolean;
  missing: string[];
};

export function AdminArtworkActions({
  artwork,
  readiness,
}: {
  artwork: WorkerArtwork;
  readiness?: ArtworkReadiness;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<Response>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${label} failed`);
      setMessage(`${label} ok`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  const canDelete =
    ["draft", "uploading", "ready"].includes(artwork.status) &&
    artwork.publishedRevision == null &&
    artwork.publishedAt == null;

  const canRepublish = artwork.status === "ready";
  const canDownloadHtmlPackage = artwork.status === "published";
  const readinessBlocks = readiness != null && readiness.ok === false;
  const republishDisabled = busy || readinessBlocks;
  const republishTitle = readinessBlocks
    ? `Missing verified assets: ${readiness.missing.join(", ") || "unknown"}`
    : "Freeze the current working revision and publish without allocating a new accession.";

  const downloadHtmlPackage = () => {
    const href = `/api/admin/archive/artworks/${encodeURIComponent(artwork.id)}/html-package`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {canDownloadHtmlPackage && (
          <button
            type="button"
            disabled={busy}
            title="Download a portable mint-package ZIP (perception.html + assets) from the published revision for local use or NFT minting."
            aria-label="Download HTML package"
            className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
            onClick={downloadHtmlPackage}
          >
            Download HTML Package
          </button>
        )}
        {canRepublish && (
          <button
            type="button"
            disabled={republishDisabled}
            title={republishTitle}
            aria-label="Republish artwork"
            className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
            onClick={() => {
              if (
                !window.confirm(
                  "Republish this artwork using the current working revision? No new accession will be allocated.",
                )
              )
                return;
              void run("Republish", () =>
                adminFetch("/api/admin/archive/publish", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ artworkId: artwork.id }),
                }),
              );
            }}
          >
            {busy ? "Publishing..." : "Republish"}
          </button>
        )}
        {artwork.status === "published" && (
          <>
            <button
              type="button"
              disabled={busy}
              title="Remove the artwork from the published public view while retaining its archival record. The published revision pointer is cleared; republish freezes a new tip."
              aria-label="Unpublish artwork"
              className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
              onClick={() => {
                if (
                  !window.confirm(
                    "Unpublish this artwork from the public archive?",
                  )
                )
                  return;
                void run("Unpublish", () =>
                  adminFetch(
                    `/api/admin/archive/artworks/${encodeURIComponent(artwork.id)}/unpublish`,
                    { method: "POST" },
                  ),
                );
              }}
            >
              Unpublish
            </button>
            <button
              type="button"
              disabled={busy}
              title="Change public visibility to hidden without deleting the archival record. The published revision pointer is retained for restore."
              aria-label="Hide artwork"
              className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
              onClick={() => {
                if (!window.confirm("Hide this artwork from public listings?"))
                  return;
                void run("Hide", () =>
                  adminFetch(
                    `/api/admin/archive/artworks/${encodeURIComponent(artwork.id)}/visibility`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "hidden" }),
                    },
                  ),
                );
              }}
            >
              Hide
            </button>
            <button
              type="button"
              disabled={busy}
              title="Mark the record as withdrawn. Editing the working tip is blocked until restored. The published revision pointer is retained."
              aria-label="Withdraw artwork"
              className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
              onClick={() => {
                if (
                  !window.confirm(
                    "Withdraw this artwork? Editing will be blocked until restored.",
                  )
                )
                  return;
                void run("Withdraw", () =>
                  adminFetch(
                    `/api/admin/archive/artworks/${encodeURIComponent(artwork.id)}/visibility`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "withdrawn" }),
                    },
                  ),
                );
              }}
            >
              Withdraw
            </button>
          </>
        )}
        {(artwork.status === "hidden" || artwork.status === "withdrawn") &&
          artwork.publishedRevision != null && (
            <button
              type="button"
              disabled={busy}
              title="Restore public published visibility using the retained published revision pointer. No new accession is allocated."
              aria-label="Restore published artwork"
              className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
              onClick={() => {
                void run("Restore", () =>
                  adminFetch(
                    `/api/admin/archive/artworks/${encodeURIComponent(artwork.id)}/visibility`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "published" }),
                    },
                  ),
                );
              }}
            >
              Restore published
            </button>
          )}
        {canDelete && (
          <button
            type="button"
            disabled={busy}
            title="Permanently delete this never-published draft from D1. Irreversible. R2 objects are not deleted."
            aria-label="Delete draft artwork"
            className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase text-red-800 disabled:opacity-50"
            onClick={() => {
              if (
                !window.confirm(
                  "Permanently delete this never-published draft from D1? R2 objects are not deleted.",
                )
              )
                return;
              void run("Delete", () =>
                adminFetch(
                  `/api/admin/archive/artworks/${encodeURIComponent(artwork.id)}`,
                  { method: "DELETE" },
                ),
              );
            }}
          >
            Delete
          </button>
        )}
      </div>
      {readinessBlocks && (
        <p className="max-w-xs text-right text-[0.68rem] text-[var(--muted)]">
          Republish unavailable: missing {readiness.missing.join(", ")}
        </p>
      )}
      {message && (
        <p className="max-w-xs text-right text-[0.68rem] text-[var(--muted)]">
          {message}
        </p>
      )}
    </div>
  );
}
