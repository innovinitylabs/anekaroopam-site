import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PerceptionCanvas } from "@/components/perception/PerceptionCanvas";
import { ArchiveProvenance } from "@/components/site/ArchiveProvenance";
import {
  getArtworkBySlug,
  getArchiveEntryBySlug,
  getAccessionRuntimeBySlug,
  listAllArchiveSlugs,
} from "@/lib/content/resolve-artwork";
import { resolveArchiveRedirect } from "@/lib/archive/redirects";
import { readSeoFromMetadata } from "@/lib/archive/archive-seo";

export const dynamic = "force-dynamic";

const SITE = "https://anekaroopam.art";

export async function generateStaticParams() {
  const slugs = await listAllArchiveSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artwork = await getArtworkBySlug(slug);
  if (!artwork) return { title: "Not found" };

  const entry = await getArchiveEntryBySlug(slug);
  const seo = readSeoFromMetadata(
    (entry?.metadata ?? artwork.metadata) as unknown as Record<string, unknown>,
  );
  const title = seo?.pageTitle || artwork.metadata.title;
  const description =
    seo?.description ||
    [artwork.metadata.title, artwork.metadata.year, artwork.metadata.process]
      .filter(Boolean)
      .join(" · ");
  const ogImage =
    entry?.assets.social ||
    entry?.assets.thumb ||
    artwork.imageSrc ||
    undefined;
  const canonical = seo?.canonicalPath || `/archive/${slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: seo?.ogTitle || title,
      description: seo?.ogDescription || description,
      url: `${SITE}${canonical}`,
      type: "article",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: seo?.twitterCard || "summary_large_image",
      title: seo?.ogTitle || title,
      description: seo?.ogDescription || description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ArchiveArtworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = await getArtworkBySlug(slug);
  if (!artwork) {
    const mapped = await resolveArchiveRedirect(slug);
    if (mapped) redirect(`/archive/${mapped.to}`);
    notFound();
  }

  const entry = await getArchiveEntryBySlug(slug);
  const runtime = await getAccessionRuntimeBySlug(slug);
  const visibilityNotice =
    runtime?.visibility.public === false ? runtime.visibility.notice : null;
  const seo = readSeoFromMetadata(
    (entry?.metadata ?? artwork.metadata) as unknown as Record<string, unknown>,
  );
  const jsonLd = seo?.schemaOrg ?? {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: artwork.metadata.title,
    ...(artwork.metadata.year
      ? { dateCreated: String(artwork.metadata.year) }
      : {}),
    ...(artwork.metadata.process
      ? { artMedium: artwork.metadata.process }
      : {}),
    url: `${SITE}/archive/${slug}`,
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--paper)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PerceptionCanvas artwork={artwork} mode="runtime" />
      {entry?.provenance && <ArchiveProvenance provenance={entry.provenance} />}
      <Link
        href="/archive"
        title="Return to the public archive listing."
        className="fixed top-6 left-6 z-[60] rounded-sm bg-black/20 px-3 py-2 text-[0.62rem] tracking-[0.2em] uppercase text-white/80 backdrop-blur-sm transition-colors hover:bg-black/35 hover:text-white"
      >
        Back to archive
      </Link>
      {entry && (
        <div className="pointer-events-none fixed bottom-6 left-6 z-[55] max-w-sm text-white/70">
          <p className="text-[0.58rem] tracking-[0.2em] uppercase">Accession</p>
          <p className="mt-1 text-[0.72rem]">{entry.metadata.title}</p>
          {visibilityNotice && (
            <p className="mt-3 border border-white/20 bg-black/25 p-3 text-[0.68rem] leading-relaxed text-white/85">
              {visibilityNotice}
            </p>
          )}
          {entry.metadata.process && (
            <p className="text-[0.68rem] opacity-70">{entry.metadata.process}</p>
          )}
        </div>
      )}
    </div>
  );
}
