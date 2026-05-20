import Link from "next/link";
import { BrandLogo } from "@/components/site/BrandLogo";
import { FadeIn } from "@/components/site/FadeIn";

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-6rem)]">
      <section className="mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center px-6 pb-24 md:px-10">
        <FadeIn>
          <BrandLogo
            href="/"
            size="xl"
            showWordmark={false}
            theme="light"
            className="mb-8"
          />
          <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
            Visual philosophy of emergence
          </p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <h1 className="mt-6 max-w-3xl font-display text-5xl leading-[1.1] tracking-tight md:text-7xl">
            Multistable perception, held in rotation
          </h1>
        </FadeIn>
        <FadeIn delay={0.2}>
          <p className="mt-10 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            A perceptual archive where forms emerge through rotation,
            instability, and sustained attention.
          </p>
        </FadeIn>
        <FadeIn delay={0.35} className="mt-14 flex flex-wrap gap-8">
          <Link
            href="/archive"
            className="text-[0.68rem] tracking-[0.2em] uppercase border-b border-[var(--ink)] pb-1"
          >
            Enter the archive
          </Link>
          <Link
            href="/perceive"
            className="text-[0.68rem] tracking-[0.2em] uppercase opacity-50 hover:opacity-90"
          >
            Perception
          </Link>
        </FadeIn>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 md:grid-cols-2 md:px-10">
          <FadeIn>
            <h2 className="font-display text-2xl tracking-wide">
              Perception is participatory
            </h2>
            <p className="prose-anek mt-6 text-[var(--muted)]">
              There is no single orientation that exhausts an artwork. Forms
              emerge, dissolve, and reconfigure as the plane turns. The archive
              preserves this instability as the work&apos;s native condition.
            </p>
          </FadeIn>
          <FadeIn delay={0.15}>
            <h2 className="font-display text-2xl tracking-wide">
              Valiroopam as process
            </h2>
            <p className="prose-anek mt-6 text-[var(--muted)]">
              Through line evolution and subconscious form detection, figures
              are discovered rather than imposed. Rotation becomes a method of
              reading what the hand already knew.
            </p>
            <Link
              href="/process"
              className="mt-8 inline-block text-[0.62rem] tracking-[0.2em] uppercase opacity-50 hover:opacity-90"
            >
              Read the process
            </Link>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
