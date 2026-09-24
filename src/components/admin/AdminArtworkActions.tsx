"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFetch } from "@/components/admin/admin-fetch";
import type { WorkerArtwork } from "@/lib/archive/worker-client";

export function AdminArtworkActions({ artwork }: { artwork: WorkerArtwork }) {
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

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {artwork.status === "published" && (
          <>
            <button
              type="button"
              disabled={busy}
              className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
              onClick={() => {
                if (!window.confirm("Unpublish this artwork from the public archive?"))
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
      {message && (
        <p className="max-w-xs text-right text-[0.68rem] text-[var(--muted)]">
          {message}
        </p>
      )}
    </div>
  );
}
