import Link from "next/link";
import { notFound } from "next/navigation";
import { FadeIn } from "@/components/site/FadeIn";
import { getWritingById, writings } from "@/lib/content/writings";

export function generateStaticParams() {
  return writings.map((w) => ({ id: w.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getWritingById(id);
  return { title: entry?.title ?? "Writing" };
}

export default async function WritingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getWritingById(id);
  if (!entry) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 pb-32 md:px-10">
      <FadeIn>
        <Link
          href="/writings"
          className="text-[0.62rem] tracking-[0.2em] uppercase opacity-50 hover:opacity-90"
        >
          Writings
        </Link>
        <p className="mt-8 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
          {entry.type} · {entry.date}
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight">
          {entry.title}
        </h1>
      </FadeIn>
      <FadeIn delay={0.15}>
        <div className="prose-anek mt-12 whitespace-pre-line text-[var(--muted)]">
          {entry.body}
        </div>
      </FadeIn>
    </article>
  );
}
