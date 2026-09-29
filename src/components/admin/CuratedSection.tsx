import Link from "next/link";
import { CuratedVisibilityToggle } from "@/components/admin/CuratedVisibilityToggle";
import { isCuratedVisible, type CuratedVisibility } from "@/lib/archive/curated";
import { archiveArtworks } from "@/lib/content/artworks";

export function CuratedSection({ visibility }: { visibility: CuratedVisibility }) {
  const entries = visibility.known
    ? new Map(visibility.entries.map((e) => [e.slug, e]))
    : null;
  return (
    <section className="mt-12 border-t border-[var(--border)] pt-8">
      <h2 className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
        Curated originals
      </h2>
      <p className="mt-2 max-w-xl text-[0.78rem] leading-relaxed text-[var(--muted)]">
        Repository works shown alongside D1 accessions. Visibility is the only
        setting; the works and their images are never edited or deleted here.
      </p>
      {!visibility.known && (
        <p className="mt-4 border border-[var(--border)] p-4 text-[0.8rem] text-red-700">
          Visibility unavailable ({visibility.reason}). All curated works are
          hidden publicly until the Worker responds.
        </p>
      )}
      <ul className="mt-6 space-y-4">
        {archiveArtworks.map((work) => {
          const entry = entries?.get(work.id);
          const visible = Boolean(entries && isCuratedVisible(visibility, work.id));
          return (
            <li key={work.id} className="border border-[var(--border)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
                    Curated (repository) ·{" "}
                    {entries ? (visible ? "visible" : "hidden") : "unknown"}
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl">
                    {work.metadata.title}
                  </h2>
                  <p className="mt-2 text-[0.75rem] text-[var(--muted)]">
                    {work.id}
                    {entry?.updatedAt
                      ? ` · changed ${entry.updatedAt.slice(0, 10)}${entry.updatedBy ? ` by ${entry.updatedBy}` : ""}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {visible && (
                    <Link
                      href={`/archive/${encodeURIComponent(work.id)}`}
                      title="Open the public archive viewer for this curated work."
                      className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
                    >
                      View
                    </Link>
                  )}
                  {entries && (
                    <CuratedVisibilityToggle slug={work.id} visible={visible} />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
