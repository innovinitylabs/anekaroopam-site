import Link from "next/link";
import { BrandLogo } from "@/components/site/BrandLogo";
import { FadeIn } from "@/components/site/FadeIn";

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] md:min-h-[calc(100vh-6rem)]">
      <section className="paper-depth mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-center px-6 pt-4 pb-16 sm:min-h-[76vh] md:min-h-[85vh] md:px-10 md:pt-0 md:pb-24">
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
          <h1 className="mt-6 max-w-3xl font-display text-[2.7rem] leading-[1.08] tracking-tight sm:text-5xl md:text-7xl">
            Multistable perception, held in rotation
          </h1>
        </FadeIn>
        <FadeIn delay={0.2}>
          <p className="mt-8 max-w-xl text-[1.02rem] leading-relaxed text-[var(--muted)] sm:text-lg md:mt-10">
            A perceptual archive where forms emerge through rotation,
            instability, and sustained attention.
          </p>
        </FadeIn>
        <FadeIn delay={0.35} className="mt-10 flex flex-wrap gap-x-8 gap-y-2 md:mt-14">
          <Link
            href="/archive"
            className="-my-3 inline-block border-b border-[var(--ink)] py-3 text-[0.68rem] tracking-[0.2em] uppercase"
          >
            Enter the archive
          </Link>
          <Link
            href="/perceive"
            className="-my-3 inline-block py-3 text-[0.68rem] tracking-[0.2em] uppercase opacity-50 hover:opacity-90"
          >
            Perception
          </Link>
        </FadeIn>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-18 md:grid-cols-2 md:gap-16 md:px-10 md:py-24">
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
