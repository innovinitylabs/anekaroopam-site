/**
 * SEO / AI-oriented metadata derived only from canonical artwork fields.
 * Never invents facts beyond user-entered and verified technical metadata.
 */

import { z } from "zod";
import type { ArtworkMetadata } from "@/lib/perception/types";

export const SeoMetadataSchema = z.object({
  pageTitle: z.string().min(1),
  description: z.string().min(1),
  ogTitle: z.string().min(1),
  ogDescription: z.string().min(1),
  twitterCard: z.enum(["summary", "summary_large_image"]).default("summary_large_image"),
  canonicalPath: z.string().min(1),
  schemaOrg: z.record(z.string(), z.unknown()),
  archiveMarkdown: z.string().min(1),
  accessibleDescription: z.string().min(1),
  reviewed: z.boolean().default(false),
  generatedAt: z.string().optional(),
  generatedFrom: z.array(z.string()).default([]),
});

export type SeoMetadata = z.infer<typeof SeoMetadataSchema>;

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://anekaroopam.art";
}

/** Build SEO draft copy strictly from provided metadata + slug. */
export function generateSeoFromMetadata(input: {
  slug: string;
  metadata: Pick<
    ArtworkMetadata,
    | "title"
    | "year"
    | "date"
    | "process"
    | "medium"
    | "dimensions"
    | "edition"
    | "collection"
    | "description"
    | "accessionId"
    | "captureMethod"
    | "postProcessing"
  >;
  thumbUrl?: string | null;
}): SeoMetadata {
  const title = input.metadata.title?.trim() || "Untitled";
  const year =
    input.metadata.year ??
    (input.metadata.date ? Number(input.metadata.date.slice(0, 4)) : undefined);
  const process = input.metadata.process?.trim();
  const medium = input.metadata.medium?.trim();
  const accession = input.metadata.accessionId?.trim();
  const userDescription = input.metadata.description?.trim();

  const parts: string[] = [];
  if (userDescription) parts.push(userDescription);
  else {
    const factual: string[] = [`${title}`];
    if (year) factual.push(`(${year})`);
    if (process) factual.push(`— ${process}`);
    if (medium) factual.push(`in ${medium}`);
    parts.push(factual.join(" "));
    parts.push("A perceptual archive record on Anekaroopam.");
  }
  if (accession) parts.push(`Accession ${accession}.`);

  const description = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 320);
  const pageTitle = year ? `${title} (${year})` : title;
  const canonicalPath = `/archive/${input.slug}`;
  const generatedFrom = [
    "title",
    year != null ? "year" : null,
    process ? "process" : null,
    medium ? "medium" : null,
    accession ? "accessionId" : null,
    userDescription ? "description" : null,
  ].filter(Boolean) as string[];

  const schemaOrg: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: title,
    url: `${siteOrigin()}${canonicalPath}`,
    ...(year ? { dateCreated: String(year) } : {}),
    ...(process ? { artMedium: process } : {}),
    ...(medium ? { artworkSurface: medium } : {}),
    ...(accession ? { identifier: accession } : {}),
    ...(input.thumbUrl ? { image: input.thumbUrl } : {}),
    isPartOf: {
      "@type": "Collection",
      name: "Anekaroopam Archive",
      url: `${siteOrigin()}/archive`,
    },
  };

  const markdownLines = [
    `# ${title}`,
    "",
    description,
    "",
    `- Slug: \`${input.slug}\``,
  ];
  if (accession) markdownLines.push(`- Accession: ${accession}`);
  if (year) markdownLines.push(`- Year: ${year}`);
  if (process) markdownLines.push(`- Process: ${process}`);
  if (medium) markdownLines.push(`- Medium: ${medium}`);
  if (input.metadata.dimensions) {
    markdownLines.push(`- Dimensions: ${input.metadata.dimensions}`);
  }
  markdownLines.push("", "_Generated from canonical archive metadata only._");

  const accessibleDescription = [
    `Artwork titled ${title}`,
    year ? ` from ${year}` : "",
    process ? `, process ${process}` : "",
    medium ? `, medium ${medium}` : "",
    accession ? `, accession ${accession}` : "",
    ".",
  ].join("");

  return SeoMetadataSchema.parse({
    pageTitle,
    description,
    ogTitle: pageTitle,
    ogDescription: description,
    twitterCard: "summary_large_image",
    canonicalPath,
    schemaOrg,
    archiveMarkdown: markdownLines.join("\n"),
    accessibleDescription,
    reviewed: false,
    generatedAt: new Date().toISOString(),
    generatedFrom,
  });
}

export function isMetadataFinalized(meta: {
  title?: string;
  year?: number;
  process?: string;
}): boolean {
  return Boolean(meta.title?.trim() && meta.year != null && meta.process?.trim());
}

export function readSeoFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): SeoMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const seo = metadata.seo;
  if (!seo || typeof seo !== "object") return null;
  const parsed = SeoMetadataSchema.safeParse(seo);
  return parsed.success ? parsed.data : null;
}
