import Image from "next/image";
import { FadeIn } from "@/components/site/FadeIn";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-32 md:px-10">
      <FadeIn>
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          About
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">
          The work and its archive
        </h1>
      </FadeIn>
      <FadeIn delay={0.08}>
        <div className="mt-12 flex items-center gap-6 border-y border-[var(--border)] py-10">
          <Image
            src={BRAND.mark}
            alt="Valipokkann mark"
            width={120}
            height={104}
            className="h-24 w-auto object-contain"
          />
          <p className="text-[0.75rem] leading-relaxed text-[var(--muted)]">
            Studio mark of Valipokkann — line evolution, rotational discovery,
            and the Valiroopam process behind this archive.
          </p>
        </div>
      </FadeIn>
      <FadeIn delay={0.1}>
        <div className="prose-anek mt-12 space-y-6 text-[var(--muted)]">
          <p>
            Anekaroopam is a visual philosophy and art framework devoted to
            multistable figurative emergence. It treats perception as rotational,
            emergent, and participatory—never settled into a single canonical
            view.
          </p>
          <p>
            This platform serves as a contemplative digital environment: an
            archival system, an orientation framework, and an interface for
            unstable visual entities. It is deliberately not a marketplace, feed,
            or dashboard.
          </p>
          <p>
            The Perception Engine at perceive.anekaroopam.art allows artworks to
            be composed with creator-defined perceptual states—angles, names,
            captions—and exported as self-contained orientations for preservation
            and future research.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}
