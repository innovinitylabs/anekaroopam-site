"use client";

import { adminFetch } from "@/components/admin/admin-fetch";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveEntryActions({
  slug,
  hasSource,
  status,
  mintedAt,
}: {
  slug: string;
  hasSource: boolean;
  status: string;
  mintedAt?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await adminFetch(`/api/admin/archive/${encodeURIComponent(slug)}/regenerate`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Regeneration failed");
      const warningNote =
        data.warnings && data.warnings.length > 0
          ? ` (${data.warnings.length} warning${data.warnings.length === 1 ? "" : "s"})`
          : "";
      setMessage(`Regenerated locally${warningNote}. Sync to GitHub to deploy.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  };

  const syncToGitHub = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await adminFetch(
        `/api/admin/archive/${encodeURIComponent(slug)}/sync`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string; commitSha?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setMessage(
        data.commitSha
          ? `Synced to GitHub (${data.commitSha.slice(0, 7)})`
          : "Synced to GitHub",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
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
      const res = await adminFetch(`/api/admin/archive/${encodeURIComponent(slug)}/source`, {
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

  const restoreTarget = mintedAt || status === "minted" ? "minted" : "published";

  const visibilityMessage = (
    nextStatus: string,
    githubSynced: boolean,
    commitSha?: string,
  ): string => {
    if (githubSynced && commitSha) {
      return `Visibility set to ${nextStatus} on GitHub (${commitSha.slice(0, 7)})`;
    }
    return `Visibility set to ${nextStatus} locally. GitHub not configured—sync manually when ready.`;
  };

  const setVisibility = async (nextStatus: string) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await adminFetch(`/api/admin/archive/${encodeURIComponent(slug)}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json()) as {
        error?: string;
        commitSha?: string;
        githubSynced?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Visibility update failed");
      setMessage(
        visibilityMessage(nextStatus, data.githubSynced === true, data.commitSha),
      );
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
      const res = await adminFetch(
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

  const discardGenerated = async () => {
    const confirmation = window.prompt(
      `Type the slug to discard this unpublished generated archive (removes local archive files; does not delete the draft workspace):\n${slug}`,
    );
    if (confirmation === null) return;
    if (confirmation !== slug) {
      setMessage("Confirmation did not match slug.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const res = await adminFetch(
        `/api/admin/archive/${encodeURIComponent(slug)}/discard`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: slug }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Discard failed");
      setMessage("Generated archive discarded");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Discard failed");
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
        onClick={syncToGitHub}
        disabled={busy}
        className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase disabled:opacity-30"
      >
        Sync to GitHub
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
      {status === "generated" && (
        <button
          type="button"
          onClick={discardGenerated}
          disabled={busy}
          className="border border-[var(--border)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase text-red-200/90 disabled:opacity-30"
        >
          Discard generated archive
        </button>
      )}
      {status === "hidden" ? (
        <button
          type="button"
          onClick={() => setVisibility(restoreTarget)}
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
          onClick={() => setVisibility(restoreTarget)}
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
