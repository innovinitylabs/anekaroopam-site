import { Suspense } from "react";
import { FadeIn } from "@/components/site/FadeIn";
import { ArchiveGrid } from "@/components/site/ArchiveGrid";
import { parseArchiveSearchParams } from "@/lib/archive/archive-search";
import { listAllArtworks } from "@/lib/content/resolve-artwork";

export const dynamic = "force-dynamic";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseArchiveSearchParams(params);
  const { artworks, total, facets, serverFiltered } =
    await listAllArtworks(filters);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 md:px-10 md:pb-24">
      <FadeIn className="paper-depth pb-8">
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          Archive
        </p>
        <h1 className="mt-4 font-display text-[2.45rem] leading-tight tracking-tight md:text-5xl">
          Perceptual archive
        </h1>
        <p className="mt-6 max-w-xl text-[var(--muted)] leading-relaxed">
          Published works from the Anekaroopam practice. Enter a record to explore
          orientation, rotation, and emergent forms.
        </p>
      </FadeIn>

      <Suspense fallback={<p className="mt-10 text-[var(--muted)]">Loading archive...</p>}>
        <ArchiveGrid
          artworks={artworks}
          facets={facets}
          initialFilters={filters}
          serverFiltered={serverFiltered}
          total={total}
        />
      </Suspense>
    </div>
  );
}
