import Link from "next/link";
import { notFound } from "next/navigation";
import { PerceptionCanvas } from "@/components/perception/PerceptionCanvas";
import { ArchiveProvenance } from "@/components/site/ArchiveProvenance";
import {
  getArtworkBySlug,
  getArchiveEntryBySlug,
  listAllArchiveSlugs,
} from "@/lib/content/resolve-artwork";

export async function generateStaticParams() {
  const slugs = await listAllArchiveSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = await getArtworkBySlug(slug);
  if (!artwork) return { title: "Not found" };
  return { title: artwork.metadata.title };
}

export default async function ArchiveArtworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = await getArtworkBySlug(slug);
  if (!artwork) notFound();

  const entry = await getArchiveEntryBySlug(slug);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--paper)]">
      <PerceptionCanvas artwork={artwork} mode="runtime" />
      {entry?.provenance && <ArchiveProvenance provenance={entry.provenance} />}
      <Link
        href="/archive"
        className="fixed top-6 left-6 z-[60] rounded-sm bg-black/20 px-3 py-2 text-[0.62rem] tracking-[0.2em] uppercase text-white/80 backdrop-blur-sm transition-colors hover:bg-black/35 hover:text-white"
      >
        Back to archive
      </Link>
      {entry && (
        <div className="pointer-events-none fixed bottom-6 left-6 z-[55] max-w-sm text-white/70">
          <p className="text-[0.58rem] tracking-[0.2em] uppercase">Accession</p>
          <p className="mt-1 text-[0.72rem]">{entry.metadata.title}</p>
          {entry.metadata.process && (
            <p className="text-[0.68rem] opacity-70">{entry.metadata.process}</p>
          )}
        </div>
      )}
    </div>
  );
}
