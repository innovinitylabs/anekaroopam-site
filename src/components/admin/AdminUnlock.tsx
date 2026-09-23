"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

type Status = "checking" | "locked" | "unlocked" | "error";

export function AdminUnlock({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("checking");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [secretFallbackAvailable, setSecretFallbackAvailable] = useState(false);

  const bypassUnlock = pathname === "/admin/unauthorized";

  useEffect(() => {
    if (bypassUnlock) return;
    let cancelled = false;
    void fetch("/api/admin/session", {
      method: "GET",
      credentials: "include",
    })
      .then(async (res) => {
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          authenticated?: boolean;
          login?: string;
          oauthConfigured?: boolean;
          secretFallbackAvailable?: boolean;
        };
        if (cancelled) return;
        startTransition(() => {
          setOauthConfigured(Boolean(data.oauthConfigured));
          setSecretFallbackAvailable(Boolean(data.secretFallbackAvailable));
          if (res.ok && data.authenticated) {
            setStatus("unlocked");
            setLogin(data.login ?? null);
            setMessage("");
            return;
          }
          if (res.status === 401) {
            setStatus("locked");
            return;
          }
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
  }, [bypassUnlock]);

  if (bypassUnlock) {
    return <>{children}</>;
  }

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
      setLogin("secret-fallback");
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
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "include",
      });
    } finally {
      setBusy(false);
      setLogin(null);
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
          Configure GitHub OAuth and ADMIN_SESSION_SECRET for this environment.
        </p>
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="mx-auto max-w-md space-y-8 px-6 py-16">
        <div className="space-y-2">
          <h1 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            Admin sign in
          </h1>
          <p className="text-[0.85rem] text-[var(--muted)]">
            Sign in with an authorized GitHub account. The public site stays open;
            mutation APIs stay locked without a session.
          </p>
        </div>

        {oauthConfigured ? (
          <a
            href="/api/admin/auth/github"
            className="inline-block border border-[var(--ink)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase"
          >
            Sign in with GitHub
          </a>
        ) : (
          <p className="text-[0.75rem] text-[var(--muted)]">
            GitHub OAuth is not configured for this deployment.
          </p>
        )}

        {secretFallbackAvailable ? (
          <div className="space-y-4 border-t border-[var(--border)] pt-6">
            <p className="text-[0.7rem] leading-relaxed text-[var(--muted)]">
              Temporary emergency/dev fallback. Disabled in normal production
              unless explicitly enabled.
            </p>
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
                className="border border-[var(--border)] px-5 py-3 text-[0.68rem] tracking-[0.16em] uppercase disabled:opacity-40"
              >
                {busy ? "Unlocking..." : "Emergency unlock"}
              </button>
            </form>
          </div>
        ) : null}

        {!oauthConfigured && !secretFallbackAvailable ? (
          <p className="text-[0.75rem] text-[var(--muted)]">
            No authentication method is available.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mx-auto flex max-w-4xl items-center justify-end gap-4 px-6 pt-3">
        {login ? (
          <span className="text-[0.55rem] tracking-[0.14em] uppercase text-[var(--muted)]">
            {login}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void lock()}
          disabled={busy}
          className="text-[0.55rem] tracking-[0.16em] uppercase text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40"
        >
          Sign out
        </button>
      </div>
      {children}
    </div>
  );
}

export function AdminUnauthorizedActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => {
          void fetch("/api/admin/auth/logout", {
            method: "POST",
            credentials: "include",
          }).then(() => {
            window.location.href = "/api/admin/auth/github";
          });
        }}
        className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
      >
        Sign out
      </button>
      <Link
        href="/api/admin/auth/github"
        className="border border-[var(--ink)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
      >
        Try another account
      </Link>
      <Link
        href="/"
        className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
      >
        Public site
      </Link>
    </div>
  );
}
