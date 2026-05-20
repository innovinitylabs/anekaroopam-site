import { FadeIn } from "@/components/site/FadeIn";

const sections = [
  {
    title: "Rotational perception",
    body: `Orientation is not a convenience of display. It is constitutive. An image may withhold its figure at one angle and release it at another—not as illusion, but as multistable legibility.

We refuse the fiction of a default view. Every rotation is a reading.`,
  },
  {
    title: "Subconscious emergence",
    body: `Forms often arrive before language. The hand moves; recognition follows. Anekaroopam honors this latency: the work exists in the interval between mark-making and naming.

Archival practice here means preserving that interval, not collapsing it into a single caption.`,
  },
  {
    title: "Multistable figuration",
    body: `A line cluster may become witness, animal, threshold, or void—sometimes within the same session of attention. These are not errors of perception but its proper richness.

The platform does not resolve ambiguity. It instruments it.`,
  },
  {
    title: "Valiroopam",
    body: `Valiroopam is the process discipline: spontaneous line evolution, rotational discovery, subconscious form detection. It is slow, iterative, and resistant to premature completion.

Artworks are records of perceptual labor, not products of fixed intention.`,
  },
];

export const metadata = {
  title: "Manifesto",
};

export default function ManifestoPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 pb-32 md:px-10">
      <FadeIn>
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          Manifesto
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">
          There is no correct orientation
        </h1>
      </FadeIn>

      <div className="mt-16 space-y-20">
        {sections.map((section, i) => (
          <FadeIn key={section.title} delay={0.08 * i}>
            <section>
              <h2 className="font-display text-2xl tracking-wide">
                {section.title}
              </h2>
              <div className="prose-anek mt-6 text-[var(--muted)] whitespace-pre-line">
                {section.body}
              </div>
            </section>
          </FadeIn>
        ))}
      </div>
    </article>
  );
}
