import Link from "next/link";
import { notFound } from "next/navigation";
import { PerceptionCanvas } from "@/components/perception/PerceptionCanvas";
import { archiveArtworks, getArtworkById } from "@/lib/content/artworks";

export function generateStaticParams() {
  return archiveArtworks.map((a) => ({ slug: a.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = getArtworkById(slug);
  if (!artwork) return { title: "Not found" };
  return { title: artwork.metadata.title };
}

export default async function ArchiveArtworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = getArtworkById(slug);
  if (!artwork) notFound();

  return (
    <div className="fixed inset-0 z-50 bg-[var(--paper)]">
      <PerceptionCanvas artwork={artwork} mode="runtime" />
      <Link
        href="/archive"
        className="fixed top-6 left-6 z-[60] rounded-sm bg-black/20 px-3 py-2 text-[0.62rem] tracking-[0.2em] uppercase text-white/80 backdrop-blur-sm transition-colors hover:bg-black/35 hover:text-white"
      >
        Back to archive
      </Link>
    </div>
  );
}
