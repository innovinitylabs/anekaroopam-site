"use client";

import { startTransition, useEffect, useState } from "react";

type Status = "checking" | "locked" | "unlocked" | "error";

export function AdminUnlock({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/session", {
      method: "GET",
      credentials: "include",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          startTransition(() => {
            setStatus("unlocked");
            setMessage("");
          });
          return;
        }
        if (res.status === 401) {
          startTransition(() => setStatus("locked"));
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (cancelled) return;
        startTransition(() => {
          setStatus("error");
          setMessage(data.error ?? "Admin session unavailable");
        });
      })
      .catch(() => {
        if (cancelled) return;
        startTransition(() => {
          setStatus("error");
          setMessage("Could not reach admin session endpoint");
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ?? "Unlock failed");
        setStatus("locked");
        return;
      }
      setSecret("");
      setStatus("unlocked");
    } catch {
      setMessage("Unlock request failed");
      setStatus("locked");
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    setBusy(true);
    try {
      await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "include",
      });
    } finally {
      setBusy(false);
      setStatus("locked");
    }
  }

  if (status === "checking") {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-[0.78rem] text-[var(--muted)]">
        Checking admin session...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-6 py-16">
        <p className="text-[0.78rem] text-[var(--muted)]">{message}</p>
        <p className="text-[0.7rem] text-[var(--muted)]">
          Set ADMIN_INGEST_ENABLED=true and ADMIN_INGEST_SECRET in the server
          environment, then unlock.
        </p>
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="mx-auto max-w-md space-y-6 px-6 py-16">
        <div className="space-y-2">
          <h1 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            Admin unlock
          </h1>
          <p className="text-[0.85rem] text-[var(--muted)]">
            Enter the ADMIN_INGEST_SECRET for this environment. The public site
            stays open; mutation APIs stay locked without this session.
          </p>
        </div>
        <form onSubmit={unlock} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              Ingest secret
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="w-full border border-[var(--border)] bg-transparent px-3 py-2 text-[0.9rem]"
            />
          </label>
          {message ? (
            <p className="text-[0.75rem] text-amber-800/90">{message}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !secret.trim()}
            className="border border-[var(--ink)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
          >
            {busy ? "Unlocking..." : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mx-auto flex max-w-4xl justify-end px-6 pt-3">
        <button
          type="button"
          onClick={() => void lock()}
          disabled={busy}
          className="text-[0.55rem] tracking-[0.16em] uppercase text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40"
        >
          Lock admin
        </button>
      </div>
      {children}
    </div>
  );
}
