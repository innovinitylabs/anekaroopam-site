"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFetch } from "@/components/admin/admin-fetch";

export function curatedVisibilityPrompt(nextVisible: boolean): string {
  return nextVisible
    ? "Show this curated work in the public archive?"
    : "Hide this curated work from the public archive, detail page, and sitemap? The work and its image are kept.";
}

/** Throws with the server's error message when the change was not stored. */
export async function submitCuratedVisibility(
  slug: string,
  visible: boolean,
): Promise<void> {
  const res = await adminFetch("/api/admin/archive/curated", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, visible }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Update failed");
}

export function CuratedVisibilityToggle({
  slug,
  visible,
}: {
  slug: string;
  visible: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const next = !visible;

  const toggle = async () => {
    if (!window.confirm(curatedVisibilityPrompt(next))) return;
    setBusy(true);
    setMessage(null);
    try {
      await submitCuratedVisibility(slug, next);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={busy}
        title={
          visible
            ? "Hide from the public archive list, detail page, and sitemap. Nothing is deleted."
            : "Show in the public archive list, detail page, and sitemap."
        }
        aria-label={visible ? "Hide curated work" : "Show curated work"}
        className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase disabled:opacity-50"
        onClick={() => void toggle()}
      >
        {busy ? "Saving..." : visible ? "Hide" : "Show"}
      </button>
      {message && (
        <p className="max-w-xs text-right text-[0.68rem] text-[var(--muted)]">
          {message}
        </p>
      )}
    </div>
  );
}
