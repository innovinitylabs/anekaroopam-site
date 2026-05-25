import { FadeIn } from "@/components/site/FadeIn";
import { ArchiveGrid } from "@/components/site/ArchiveGrid";
import { listAllArtworks } from "@/lib/content/resolve-artwork";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const artworks = await listAllArtworks();

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 md:px-10 md:pb-24">
      <FadeIn className="paper-depth pb-8">
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          Archive
        </p>
        <h1 className="mt-4 font-display text-[2.45rem] leading-tight tracking-tight md:text-5xl">
          Perceptual records
        </h1>
        <p className="mt-6 max-w-xl text-[var(--muted)] leading-relaxed">
          Minimal metadata. Each entry opens into the orientation interface where
          states await discovery.
        </p>
      </FadeIn>

      <ArchiveGrid artworks={artworks} />
    </div>
  );
}
