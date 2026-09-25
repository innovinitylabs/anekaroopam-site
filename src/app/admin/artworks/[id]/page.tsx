import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminArtworkActions } from "@/components/admin/AdminArtworkActions";
import { formatByteSize } from "@/lib/archive/commit-bundle-limits";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import {
  workerGetArtwork,
  workerListEvents,
} from "@/lib/archive/worker-client";

export const dynamic = "force-dynamic";

export default async function AdminArtworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!preferArchiveWorker()) {
    notFound();
  }

  const { id } = await params;
  let detail;
  let events: Array<{
    id: string;
    event_type: string;
    payload_json: string | null;
    created_at: string;
  }> = [];
  try {
    detail = await workerGetArtwork(id);
    const eventRes = await workerListEvents(id);
    events = eventRes.events;
  } catch {
    notFound();
  }

  const { artwork, workingRevision, publishedRevision, assets, readiness } =
    detail;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-[0.62rem] tracking-[0.22em] uppercase text-[var(--muted)]">
        <Link href="/admin" className="hover:text-[var(--foreground)]">
          Dashboard
        </Link>
        {" / "}
        Artwork
      </p>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-8">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            {artwork.title}
          </h1>
          <p className="mt-2 text-[0.75rem] text-[var(--muted)]">
            {artwork.accessionId} · {artwork.status} · {artwork.slug}
          </p>
          <p className="mt-1 text-[0.75rem] text-[var(--muted)]">
            Working rev {artwork.workingRevision}
            {artwork.publishedRevision != null
              ? ` · Published rev ${artwork.publishedRevision}`
              : " · Not published"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/new?draft=${encodeURIComponent(artwork.draftId)}`}
            title="Open the working revision in the ingestion wizard. Does not change the published freeze."
            className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
          >
            Edit working revision
          </Link>
          {artwork.status === "published" && (
            <Link
              href={`/archive/${encodeURIComponent(artwork.slug)}`}
              title="Open the public archive viewer for the published revision."
              className="border border-[var(--border)] px-3 py-1.5 text-[0.62rem] tracking-[0.12em] uppercase"
            >
              Public view
            </Link>
          )}
          <AdminArtworkActions artwork={artwork} readiness={readiness} />
        </div>
      </header>

      {artwork.status === "ready" && (
        <p className="mt-6 border border-[var(--border)] p-4 text-[0.78rem] leading-relaxed text-[var(--muted)]">
          Republish freezes the current working revision and points the public
          listing at it. The accession stays the same; historical frozen revisions
          are not modified. Use Edit working revision only when metadata or media
          must change before publishing again.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
          Readiness
        </h2>
        <p className="mt-2 text-[0.85rem]">
          {readiness.ok
            ? "Required assets verified — eligible to Republish when status is ready"
            : `Missing: ${readiness.missing.join(", ") || "unknown"}`}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
          Working revision metadata
        </h2>
        <pre className="mt-3 overflow-x-auto border border-[var(--border)] p-4 text-[0.72rem] leading-relaxed">
          {JSON.stringify(workingRevision?.metadata ?? {}, null, 2)}
        </pre>
        {publishedRevision && (
          <>
            <h2 className="mt-6 text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
              Published revision {publishedRevision.revision}
            </h2>
            <pre className="mt-3 overflow-x-auto border border-[var(--border)] p-4 text-[0.72rem] leading-relaxed">
              {JSON.stringify(publishedRevision.metadata ?? {}, null, 2)}
            </pre>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
          Assets (working tip)
        </h2>
        {assets.length === 0 ? (
          <p className="mt-2 text-[0.85rem] text-[var(--muted)]">No assets registered.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {assets.map((asset) => (
              <li
                key={`${asset.role}-${asset.object_key}`}
                className="border border-[var(--border)] px-4 py-3 text-[0.75rem]"
              >
                <span className="tracking-[0.12em] uppercase">{asset.role}</span>
                {" · "}
                {asset.verified_at ? "verified" : "unverified"}
                {" · "}
                {formatByteSize(asset.byte_size)}
                <p className="mt-1 break-all text-[var(--muted)]">{asset.object_key}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
          Events
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-[0.85rem] text-[var(--muted)]">No events.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="border border-[var(--border)] px-4 py-3 text-[0.75rem]"
              >
                <span className="tracking-[0.12em] uppercase">{event.event_type}</span>
                <span className="text-[var(--muted)]"> · {event.created_at}</span>
                {event.payload_json && (
                  <p className="mt-1 break-all text-[var(--muted)]">{event.payload_json}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-[0.75rem] leading-relaxed text-[var(--muted)]">
        Editing always updates the working revision. Published and frozen revisions
        stay immutable; republish freezes the working tip and points the public
        listing at the new frozen revision.
      </p>
    </main>
  );
}
