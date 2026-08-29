import Link from "next/link";
import { ArchiveEntryActions } from "@/components/admin/ArchiveEntryActions";
import { DraftDeleteButton } from "@/components/admin/DraftDeleteButton";
import {
  draftSourcePublicLabel,
  listAccessionDrafts,
} from "@/lib/archive/draft-store";
import { getAllArchiveEntries } from "@/lib/archive/load-entry";
import type { ArchiveEntry, ProvenanceRecord } from "@/lib/archive/schema";

function provenanceStatus(provenance: ProvenanceRecord): string {
  if (provenance.marketplace.length > 0) return "marketplace linked";
  if (provenance.auction.length > 0) return "auction linked";
  if (provenance.mint.length > 0) return "mint linked";
  return "no provenance links";
}

function hasOriginalSource(entry: ArchiveEntry): boolean {
  return entry.source?.kind === "original" && Boolean(entry.source.storedFilename);
}

export default async function AdminDraftsPage() {
  const drafts = await listAccessionDrafts();
  const entries = await getAllArchiveEntries({ includeHidden: true });

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

      {drafts.length === 0 && entries.length === 0 ? (
        <div className="border border-[var(--border)] p-6">
          <p className="text-[0.85rem] text-[var(--muted)]">
            No accession drafts or published archive records yet.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-4 text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
              Working drafts
            </h2>
            {drafts.length === 0 ? (
              <p className="border border-[var(--border)] p-5 text-[0.85rem] text-[var(--muted)]">
                No unfinished drafts.
              </p>
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
                        <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                          Prepared: {draft.processing.preparedSource ? "yes" : "not yet"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Link
                          href={`/admin/new?draft=${encodeURIComponent(draft.draftId)}`}
                          className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
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

          <section>
            <h2 className="mb-4 text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
              Published records
            </h2>
            {entries.length === 0 ? (
              <p className="border border-[var(--border)] p-5 text-[0.85rem] text-[var(--muted)]">
                No published filesystem entries.
              </p>
            ) : (
              <ul className="space-y-4">
                {entries.map((entry) => {
                  const sourceReady = hasOriginalSource(entry);
                  const preparedReady = Boolean(entry.processing?.preparedSource);
                  const derivativeReady = entry.derivatives.length > 0;
                  return (
                    <li
                      key={entry.slug}
                      className="border border-[var(--border)] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                            {entry.metadata.accessionId ?? entry.accessionId ?? "Unassigned"} · {entry.status}
                          </p>
                          <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl">
                            {entry.metadata.title || entry.slug}
                          </h2>
                          <p className="mt-2 text-[0.75rem] text-[var(--muted)]">
                            {entry.slug}
                          </p>
                          <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                            Source: {sourceReady ? entry.source?.originalFilename ?? "preserved" : "source required"}
                          </p>
                          <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                            Prepared: {preparedReady ? "canonical prepared master" : "not recorded"}
                          </p>
                          <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                            Derivatives: {derivativeReady ? `${entry.derivatives.length} recorded` : "regenerate to record metadata"}
                          </p>
                          <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
                            Provenance: {provenanceStatus(entry.provenance)}
                          </p>
                          <ArchiveEntryActions
                            slug={entry.slug}
                            hasSource={sourceReady}
                            status={entry.status}
                            mintedAt={entry.mintedAt}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/edit/${encodeURIComponent(entry.slug)}`}
                            className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/archive/${encodeURIComponent(entry.slug)}`}
                            className="border border-[var(--border)] px-4 py-2 text-[0.68rem] tracking-[0.14em] uppercase"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
