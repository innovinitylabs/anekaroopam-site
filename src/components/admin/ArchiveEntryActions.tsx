"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveEntryActions({
  slug,
  hasSource,
  status,
}: {
  slug: string;
  hasSource: boolean;
  status: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/archive/${encodeURIComponent(slug)}/regenerate`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Regeneration failed");
      setMessage("Regenerated");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  };

  const depositSource = async (file: File) => {
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("source", file);
    try {
      const res = await fetch(`/api/admin/archive/${encodeURIComponent(slug)}/source`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Source deposit failed");
      setMessage("Source deposited");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Source deposit failed");
    } finally {
      setBusy(false);
    }
  };

  const setVisibility = async (nextStatus: string) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/archive/${encodeURIComponent(slug)}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Visibility update failed");
      setMessage(`Visibility set to ${nextStatus}`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Visibility update failed");
    } finally {
      setBusy(false);
    }
  };

  const runArchiveAction = async (
    endpoint: "manifest" | "mint-package" | "exports",
    doneMessage: string,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/admin/archive/${encodeURIComponent(slug)}/${endpoint}`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? doneMessage);
      setMessage(doneMessage);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : doneMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={regenerate}
        disabled={busy || !hasSource}
        className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
      >
        Regenerate
      </button>
      <button
        type="button"
        onClick={() => runArchiveAction("mint-package", "Mint package exported")}
        disabled={busy}
        className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
      >
        Export mint package
      </button>
      <button
        type="button"
        onClick={() => runArchiveAction("manifest", "Manifest rebuilt")}
        disabled={busy}
        className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
      >
        Rebuild manifest
      </button>
      <button
        type="button"
        onClick={() => runArchiveAction("exports", "Exports rebuilt")}
        disabled={busy}
        className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
      >
        Rebuild exports
      </button>
      {status === "hidden" ? (
        <button
          type="button"
          onClick={() => setVisibility("published")}
          disabled={busy}
          className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
        >
          Unhide
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setVisibility("hidden")}
          disabled={busy}
          className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
        >
          Hide
        </button>
      )}
      {status === "withdrawn" ? (
        <button
          type="button"
          onClick={() => setVisibility("published")}
          disabled={busy}
          className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
        >
          Restore
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setVisibility("withdrawn")}
          disabled={busy}
          className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
        >
          Withdraw
        </button>
      )}
      {!hasSource && (
        <label className="cursor-pointer border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase">
          Deposit source
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) depositSource(file);
            }}
          />
        </label>
      )}
      {message && (
        <span className="text-[0.68rem] text-[var(--muted)]">{message}</span>
      )}
    </div>
  );
}
