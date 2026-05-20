import type { Metadata } from "next";
import { FadeIn } from "@/components/site/FadeIn";
import { RotatingBrandMark } from "@/components/site/RotatingBrandMark";

const siteUrl = "https://anekaroopam.art";
const socialImage = "/opengraph-image";
const pageDescription =
  "Anekaroopam is a visual philosophy and perceptual archive focused on multistable figurative emergence through rotational perception and the Valiroopam process.";

const perceptualQuestions = [
  {
    question: "What is Anekaroopam?",
    answer:
      "Anekaroopam is a visual philosophy and art framework focused on multistable figurative emergence through rotational perception. Artworks are not treated as fixed images, but as unstable perceptual configurations that reveal different entities depending on orientation, attention, and visual interpretation.",
  },
  {
    question: "What does “multistable figuration” mean?",
    answer:
      "Multistable figuration refers to visual forms that can stabilize into multiple perceptual readings instead of a single fixed figure. In Anekaroopam, forms may emerge, dissolve, or transform into other entities as the artwork rotates or the viewer’s perception shifts.",
  },
  {
    question: "What is the Valiroopam process?",
    answer:
      "Valiroopam is the perceptual and artistic process through which Anekaroopam works emerge. Instead of constructing predefined illustrations, forms are discovered through spontaneous line evolution, subconscious emergence, rotational observation, and perceptual recognition.",
  },
  {
    question: "Is there a correct orientation for an artwork?",
    answer:
      "No. Anekaroopam rejects the idea of a single authoritative orientation. Rotation is treated as part of the artwork itself, allowing perceptual states to emerge through multiple angles rather than a fixed viewing position.",
  },
  {
    question: "Why do artworks change through rotation?",
    answer:
      "Rotation alters perceptual relationships between lines, negative space, pressure patterns, and emergent structures. As orientation changes, viewers may detect different figurative configurations that were previously latent or unstable.",
  },
  {
    question: "Are the hidden forms intentional?",
    answer:
      "Some forms are consciously recognized during creation, while others emerge subconsciously through the Valiroopam process. Anekaroopam treats perception itself as participatory, allowing discovered forms to exist without requiring full authorial control.",
  },
  {
    question: "Is Anekaroopam generative art?",
    answer:
      "Anekaroopam is not algorithmically generative art in the traditional sense. The works are physically created through analog mark-making, rotational perception, subconscious form detection, and emergent visual discovery rather than computational generation.",
  },
  {
    question: "Is this an NFT marketplace?",
    answer:
      "No. The platform functions primarily as a perceptual archive, orientation framework, and research environment for unstable visual forms. Blockchain and archival distribution systems may exist around the work, but the platform itself is not designed as a conventional NFT marketplace.",
  },
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "Anekaroopam",
      url: siteUrl,
      description: pageDescription,
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Anekaroopam",
      url: siteUrl,
      description:
        "Anekaroopam is a visual philosophy and perceptual archive for multistable figurative emergence, rotational perception, and the Valiroopam process.",
      founder: { "@id": `${siteUrl}/#valipokkann` },
    },
    {
      "@type": "Person",
      "@id": `${siteUrl}/#valipokkann`,
      name: "Valipokkann",
      url: siteUrl,
      description:
        "Creator of Anekaroopam and the Valiroopam process.",
    },
    {
      "@type": "CreativeWork",
      "@id": `${siteUrl}/#anekaroopam`,
      name: "Anekaroopam",
      url: siteUrl,
      creator: { "@id": `${siteUrl}/#valipokkann` },
      description: pageDescription,
      about: [
        { "@type": "Thing", name: "multistable figuration" },
        { "@type": "Thing", name: "rotational perception" },
        { "@type": "Thing", name: "perceptual archive" },
      ],
    },
    {
      "@type": "CreativeWork",
      "@id": `${siteUrl}/#valiroopam`,
      name: "Valiroopam",
      creator: { "@id": `${siteUrl}/#valipokkann` },
      isPartOf: { "@id": `${siteUrl}/#anekaroopam` },
      description:
        "Valiroopam is the perceptual and artistic process through which Anekaroopam works emerge by spontaneous line evolution, rotational observation, and subconscious form recognition.",
      about: [
        { "@type": "Thing", name: "rotational perception" },
        { "@type": "Thing", name: "subconscious form detection" },
        { "@type": "Thing", name: "emergent visual discovery" },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/about#perceptual-questions`,
      name: "Perceptual Questions",
      url: `${siteUrl}/about`,
      about: [
        { "@id": `${siteUrl}/#anekaroopam` },
        { "@id": `${siteUrl}/#valiroopam` },
      ],
      mainEntity: perceptualQuestions.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
  ],
};

export const metadata: Metadata = {
  title: "About",
  description: pageDescription,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Anekaroopam",
    description: pageDescription,
    url: "/about",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "Valiroopam artwork showing figurative emergence through rotational perception",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Anekaroopam",
    description: pageDescription,
    images: [socialImage],
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-32 md:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
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
          <RotatingBrandMark theme="light" size="xl" />
          <p className="text-[0.75rem] leading-relaxed text-[var(--muted)]">
            Studio mark of Valipokkann — line evolution, rotational discovery,
            and the Valiroopam process behind this archive. Click the mark to
            change orientation.
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
            The perception system lets artworks be composed with creator-defined
            perceptual states—angles, optional names, captions—and exported as
            self-contained orientations for preservation and future research.
          </p>
        </div>
      </FadeIn>
      <FadeIn delay={0.16}>
        <section
          aria-labelledby="perceptual-questions"
          className="mt-20 border-t border-[var(--border)] pt-12"
        >
          <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
            Notes
          </p>
          <h2
            id="perceptual-questions"
            className="mt-4 font-display text-3xl tracking-tight md:text-4xl"
          >
            Perceptual Questions
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-[var(--muted)]">
            Clarifications surrounding Anekaroopam, rotational perception, and the
            Valiroopam process.
          </p>
          <div className="mt-10 space-y-10">
            {perceptualQuestions.map(({ question, answer }) => (
              <article key={question} className="max-w-2xl">
                <h3 className="font-display text-2xl leading-tight text-[var(--ink)]">
                  {question}
                </h3>
                <p className="mt-3 text-[0.98rem] leading-7 text-[var(--muted)]">
                  {answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </FadeIn>
    </div>
  );
}
