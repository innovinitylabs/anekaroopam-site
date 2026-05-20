import Link from "next/link";
import { FadeIn } from "@/components/site/FadeIn";

export const metadata = { title: "Process" };

const phases = [
  {
    name: "Line evolution",
    text: "Marks accumulate without immediate commitment to figure. Density, rhythm, and refusal are allowed to coexist.",
  },
  {
    name: "Spontaneous emergence",
    text: "Forms surface from the field before they are named. The artist withholds correction to let instability breathe.",
  },
  {
    name: "Rotational discovery",
    text: "The plane turns. What was ground becomes figure. What was noise becomes witness. Each angle is a provisional reading.",
  },
  {
    name: "Subconscious form detection",
    text: "Recognition arrives sideways—in peripheral attention, in delayed naming. Valiroopam documents these recognitions as perceptual states.",
  },
];

export default function ProcessPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-32 md:px-10">
      <FadeIn>
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          Process
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">
          Valiroopam
        </h1>
        <p className="prose-anek mt-8 text-[var(--muted)]">
          Valiroopam is the working method behind Anekaroopam: a discipline of
          drawing that treats orientation as discovery rather than display.
          Works are archived with their perceptual states so future readers may
          inhabit the same instability.
        </p>
      </FadeIn>

      <ol className="mt-20 space-y-16 border-l border-[var(--border)] pl-8">
        {phases.map((phase, i) => (
          <FadeIn key={phase.name} delay={0.06 * i}>
            <li>
              <span className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-2 font-display text-2xl">{phase.name}</h2>
              <p className="prose-anek mt-4 text-[var(--muted)]">{phase.text}</p>
            </li>
          </FadeIn>
        ))}
      </ol>

      <FadeIn delay={0.3} className="mt-20">
        <Link
          href="/perceive"
          className="text-[0.68rem] tracking-[0.2em] uppercase border-b border-[var(--ink)] pb-1"
        >
          Configure orientations
        </Link>
      </FadeIn>
    </div>
  );
}
