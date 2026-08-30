"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DraftDeleteButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const deleteDraft = async () => {
    const confirmation = window.prompt(
      `Delete draft workspace only (does not remove any archive record or source files).\nType the draft ID to confirm:\n${draftId}`,
    );
    if (confirmation === null) return;
    if (confirmation !== draftId) {
      setMessage("Confirmation did not match draft ID.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const res = await adminFetch(
        `/api/admin/drafts/${encodeURIComponent(draftId)}/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: draftId }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Draft deletion failed");
      setMessage("Draft deleted.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Draft deletion failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={deleteDraft}
        disabled={busy}
        className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase text-[var(--muted)]"
      >
        Delete draft
      </button>
      <p className="max-w-xs text-right text-[0.65rem] leading-relaxed text-[var(--muted)]">
        Removes this unfinished editing workspace only. To remove an unpublished
        generated archive, use Discard on the archive record.
      </p>
      {message ? (
        <p className="text-[0.72rem] text-[var(--muted)]">{message}</p>
      ) : null}
    </div>
  );
}
