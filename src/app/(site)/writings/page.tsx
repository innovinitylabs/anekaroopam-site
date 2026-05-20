import Link from "next/link";
import { FadeIn } from "@/components/site/FadeIn";
import { writings } from "@/lib/content/writings";

export const metadata = { title: "Writings" };

export default function WritingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-32 md:px-10">
      <FadeIn>
        <p className="text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)]">
          Writings
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">
          Essays, notes, fragments
        </h1>
      </FadeIn>

      <ul className="mt-16 divide-y divide-[var(--border)]">
        {writings.map((entry, i) => (
          <FadeIn key={entry.id} delay={0.05 * i}>
            <li className="py-10">
              <Link href={`/writings/${entry.id}`} className="group block">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                    {entry.type}
                  </span>
                  <time className="text-[0.62rem] tracking-[0.12em] text-[var(--muted)]">
                    {entry.date}
                  </time>
                </div>
                <h2 className="mt-3 font-display text-2xl tracking-wide group-hover:opacity-70 transition-opacity">
                  {entry.title}
                </h2>
                <p className="mt-3 text-[var(--muted)] leading-relaxed">
                  {entry.excerpt}
                </p>
              </Link>
            </li>
          </FadeIn>
        ))}
      </ul>
    </div>
  );
}
