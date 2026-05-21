import Link from "next/link";
import {
  draftSourcePublicLabel,
  listAccessionDrafts,
} from "@/lib/archive/draft-store";

export default async function AdminDraftsPage() {
  const drafts = await listAccessionDrafts();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 border-b border-[var(--border)] pb-8">
        <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
          Accession drafts
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
              Unfinished records
            </h1>
            <p className="mt-3 max-w-xl text-[0.88rem] leading-relaxed text-[var(--muted)]">
              Drafts preserve source deposits, orientation states, metadata, and
              publication status before they become public archive records.
            </p>
          </div>
          <Link
            href="/admin/new"
            className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
          >
            New draft
          </Link>
        </div>
      </header>

      {drafts.length === 0 ? (
        <div className="border border-[var(--border)] p-6">
          <p className="text-[0.85rem] text-[var(--muted)]">
            No accession drafts yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {drafts.map((draft) => (
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
                <Link
                  href={`/admin/new?draft=${encodeURIComponent(draft.draftId)}`}
                  className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
                >
                  Resume
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
