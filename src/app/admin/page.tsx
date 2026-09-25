import Link from "next/link";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import { workerListArtworks, type WorkerArtwork } from "@/lib/archive/worker-client";
import {
  listAccessionDraftsDurable,
  listArchiveEntriesFromGitHub,
  githubStorageAvailable,
} from "@/lib/archive/draft-github-store";
import { getAllArchiveEntries } from "@/lib/archive/load-entry";
import { AdminArtworkActions } from "@/components/admin/AdminArtworkActions";
import { DraftDeleteButton } from "@/components/admin/DraftDeleteButton";
import { draftSourcePublicLabel } from "@/lib/archive/draft-store";
import type { AccessionDraft, ArchiveEntry } from "@/lib/archive/schema";

export const dynamic = "force-dynamic";

type Tab =
  | "all"
  | "drafts"
  | "published"
  | "ready"
  | "hidden"
  | "withdrawn";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "ready", label: "Ready" },
  { id: "published", label: "Published" },
  { id: "hidden", label: "Hidden" },
  { id: "withdrawn", label: "Withdrawn" },
];

function parseTab(raw: string | undefined): Tab {
  if (TABS.some((t) => t.id === raw)) return raw as Tab;
  return "all";
}

function statusForTab(tab: Tab): string | string[] | undefined {
  switch (tab) {
    case "drafts":
      return ["draft", "uploading"];
    case "ready":
      return "ready";
    case "published":
      return "published";
    case "hidden":
      return "hidden";
    case "withdrawn":
      return "withdrawn";
    default:
      return undefined;
  }
}

async function loadWorkerDashboard(tab: Tab, q?: string) {
  const status = statusForTab(tab);
  const { artworks, total } = await workerListArtworks({
    status,
    q,
    limit: 100,
  });
  const counts = await Promise.all(
    (
      [
        ["drafts", ["draft", "uploading"]],
        ["ready", "ready"],
        ["published", "published"],
        ["hidden", "hidden"],
        ["withdrawn", "withdrawn"],
      ] as const
    ).map(async ([key, st]) => {
      const res = await workerListArtworks({ status: st as string | string[], limit: 1 });
      return [key, res.total ?? res.artworks.length] as const;
    }),
  );
  const countMap = Object.fromEntries(counts) as Record<string, number>;
  const all = await workerListArtworks({ limit: 1 });
  countMap.all = all.total ?? all.artworks.length;
  return { artworks, total: total ?? artworks.length, counts: countMap };
}

async function loadLegacyDashboard() {
  const drafts = await listAccessionDraftsDurable();
  let entries: ArchiveEntry[];
  if (githubStorageAvailable()) {
    try {
      entries = await listArchiveEntriesFromGitHub();
    } catch {
      entries = await getAllArchiveEntries({ includeHidden: true });
    }
  } else {
    entries = await getAllArchiveEntries({ includeHidden: true });
  }
  return { drafts, entries };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const q = params.q?.trim() || undefined;
  const workerMode = preferArchiveWorker();

  if (workerMode) {
    let artworks: WorkerArtwork[] = [];
    let total = 0;
    let counts: Record<string, number> = {};
    let loadError: string | null = null;
    try {
      const data = await loadWorkerDashboard(tab, q);
      artworks = data.artworks;
      total = data.total;
      counts = data.counts;
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to load artworks";
    }

    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <DashboardHeader />
        <TabNav tab={tab} counts={counts} q={q} />
        <SearchForm q={q} tab={tab} />

        {loadError ? (
          <p className="mt-8 border border-[var(--border)] p-5 text-[0.85rem] text-red-700">
            {loadError}
          </p>
        ) : artworks.length === 0 ? (
          <EmptyState message="No artworks match this view." />
        ) : (
          <ul className="mt-8 space-y-4">
            {artworks.map((artwork) => (
              <li
                key={artwork.id}
                className="border border-[var(--border)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                      {artwork.accessionId} · {artwork.status}
                      {artwork.publishedRevision != null
                        ? ` · rev ${artwork.publishedRevision}`
                        : ""}
                    </p>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl">
                      <Link
                        href={`/admin/artworks/${encodeURIComponent(artwork.id)}`}
                        className="hover:underline"
                      >
                        {artwork.title || artwork.slug}
                      </Link>
                    </h2>
                    <p className="mt-2 text-[0.75rem] text-[var(--muted)]">
                      {artwork.slug}
                      {artwork.year != null ? ` · ${artwork.year}` : ""}
                      {artwork.process ? ` · ${artwork.process}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/new?draft=${encodeURIComponent(artwork.draftId)}`}
                      title="Open the working revision in the ingestion wizard to edit metadata, media, or orientation."
                      className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                    >
                      Edit working
                    </Link>
                    <Link
                      href={`/admin/artworks/${encodeURIComponent(artwork.id)}`}
                      title="Open admin detail: readiness, revisions, assets, and lifecycle actions."
                      className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                    >
                      Detail
                    </Link>
                    {artwork.status === "published" && (
                      <Link
                        href={`/archive/${encodeURIComponent(artwork.slug)}`}
                        title="Open the public archive viewer for the published revision."
                        className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                      >
                        View
                      </Link>
                    )}
                    <AdminArtworkActions artwork={artwork} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-[0.68rem] text-[var(--muted)]">
          Showing {artworks.length} of {total}
        </p>
      </main>
    );
  }

  const { drafts, entries } = await loadLegacyDashboard();
  const filteredDrafts =
    tab === "all" || tab === "drafts" ? drafts : ([] as AccessionDraft[]);
  const filteredEntries =
    tab === "drafts"
      ? []
      : entries.filter((e) => {
          if (tab === "all") return true;
          if (tab === "published") return e.status === "published";
          if (tab === "hidden") return e.status === "hidden";
          if (tab === "withdrawn") return e.status === "withdrawn";
          return true;
        });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <DashboardHeader />
      <TabNav
        tab={tab}
        counts={{
          all: drafts.length + entries.length,
          drafts: drafts.length,
          published: entries.filter((e) => e.status === "published").length,
          hidden: entries.filter((e) => e.status === "hidden").length,
          withdrawn: entries.filter((e) => e.status === "withdrawn").length,
        }}
        q={q}
      />

      {filteredDrafts.length === 0 && filteredEntries.length === 0 ? (
        <EmptyState message="No accession drafts or archive records yet." />
      ) : (
        <div className="mt-8 space-y-10">
          {(tab === "all" || tab === "drafts") && (
            <section>
              <h2 className="mb-4 text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
                Working drafts
              </h2>
              {filteredDrafts.length === 0 ? (
                <EmptyState message="No unfinished drafts." />
              ) : (
                <ul className="space-y-4">
                  {filteredDrafts.map((draft) => (
                    <li
                      key={draft.draftId}
                      className="border border-[var(--border)] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                            {draft.accessionId} · {draft.status}
                          </p>
                          <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl">
                            {draft.artwork.metadata.title || draft.slug}
                          </h2>
                          <p className="mt-2 text-[0.75rem] text-[var(--muted)]">
                            {draft.draftId} · {draft.slug}
                          </p>
                          <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                            Source: {draftSourcePublicLabel(draft)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/new?draft=${encodeURIComponent(draft.draftId)}`}
                            title="Continue editing this unfinished accession draft in the wizard."
                            className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                          >
                            Resume
                          </Link>
                          <DraftDeleteButton draftId={draft.draftId} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {tab !== "drafts" && filteredEntries.length > 0 && (
            <section>
              <h2 className="mb-4 text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
                Archive records
              </h2>
              <ul className="space-y-4">
                {filteredEntries.map((entry) => (
                  <li
                    key={entry.slug}
                    className="border border-[var(--border)] p-5"
                  >
                    <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                      {entry.accessionId ?? "—"} · {entry.status}
                    </p>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl">
                      {entry.metadata.title}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/admin/new?edit=${encodeURIComponent(entry.slug)}`}
                        title="Open this archive record in the ingestion wizard for revision."
                        className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/archive/${encodeURIComponent(entry.slug)}`}
                        title="Open the public archive viewer for this slug."
                        className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                      >
                        View
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function DashboardHeader() {
  return (
    <header className="mb-10 border-b border-[var(--border)] pb-8">
      <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
        Archive management
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-3 max-w-xl text-[0.88rem] leading-relaxed text-[var(--muted)]">
            Browse drafts and published records, open working revisions for edit,
            and manage visibility without mutating frozen history.
          </p>
        </div>
        <Link
          href="/admin/new"
          className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
        >
          New accession
        </Link>
      </div>
    </header>
  );
}

function TabNav({
  tab,
  counts,
  q,
}: {
  tab: Tab;
  counts: Record<string, number>;
  q?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-4">
      {TABS.map((t) => {
        const params = new URLSearchParams();
        if (t.id !== "all") params.set("tab", t.id);
        if (q) params.set("q", q);
        const href = params.toString() ? `/admin?${params}` : "/admin";
        const active = tab === t.id;
        const count = counts[t.id];
        return (
          <Link
            key={t.id}
            href={href}
            className={`px-3 py-1.5 text-[0.62rem] tracking-[0.14em] uppercase ${
              active
                ? "border border-[var(--foreground)]"
                : "border border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
            {typeof count === "number" ? ` (${count})` : ""}
          </Link>
        );
      })}
    </nav>
  );
}

function SearchForm({ q, tab }: { q?: string; tab: Tab }) {
  return (
    <form className="mt-6" method="get" action="/admin">
      {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
      <label className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        Search
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Title, accession, or slug"
          className="mt-1 block w-full max-w-md border-b border-[var(--border)] bg-transparent py-2 text-sm normal-case tracking-normal outline-none"
        />
      </label>
    </form>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-8 border border-[var(--border)] p-6">
      <p className="text-[0.85rem] text-[var(--muted)]">{message}</p>
      <Link
        href="/admin/new"
        className="mt-4 inline-block text-[0.68rem] tracking-[0.14em] uppercase underline-offset-4 hover:underline"
      >
        Start a new accession
      </Link>
    </div>
  );
}
