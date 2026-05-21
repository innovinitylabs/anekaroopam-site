import { z } from "zod";

export const ARCHIVE_VERSION = 1 as const;

export const DraftStatusSchema = z.enum([
  "draft",
  "prepared",
  "generated",
  "published",
  "minted",
  "withdrawn",
]);

export const ProvenanceLinkSchema = z.object({
  label: z.string().default(""),
  platform: z.string().default(""),
  url: z.string().default(""),
  chain: z.string().default(""),
  tokenId: z.string().optional(),
  contractAddress: z.string().optional(),
  transactionHash: z.string().optional(),
  recordedAt: z.string().optional(),
});

export const ProvenanceRecordSchema = z.preprocess((value) => {
  if (
    value &&
    typeof value === "object" &&
    "url" in value &&
    !("mint" in value)
  ) {
    const legacy = value as { platform?: string; url?: string; chain?: string };
    return {
      mint: legacy.url
        ? [
            {
              label: "Mint",
              platform: legacy.platform ?? "",
              url: legacy.url,
              chain: legacy.chain ?? "",
            },
          ]
        : [],
      auction: [],
      marketplace: [],
    };
  }
  return value;
}, z.object({
  mint: z.array(ProvenanceLinkSchema).default([]),
  auction: z.array(ProvenanceLinkSchema).default([]),
  marketplace: z.array(ProvenanceLinkSchema).default([]),
}));

export const ArchiveAssetsSchema = z.object({
  artwork: z.string(),
  preview: z.string(),
  social: z.string(),
  thumb: z.string(),
  previewWebp: z.string().optional(),
  socialJpg: z.string().optional(),
});

export const PerceptualStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  angle: z.number(),
  caption: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const OverlayFieldsSchema = z
  .object({
    title: z.boolean().optional(),
    year: z.boolean().optional(),
    process: z.boolean().optional(),
    state: z.boolean().optional(),
    caption: z.boolean().optional(),
    advanced: z.boolean().optional(),
  })
  .optional();

export const ArchivePerceptionSchema = z.object({
  states: z.array(PerceptualStateSchema),
  background: z.union([
    z.enum(["black", "paper", "gallery", "archival", "custom"]),
    z.string(),
  ]),
  initialAngle: z.number().optional(),
  snapToState: z.boolean().optional(),
  showMetadataOverlay: z.boolean().optional(),
  overlayFields: OverlayFieldsSchema,
});

export const ArchiveMetadataFieldsSchema = z.object({
  accessionId: z.string().optional(),
  title: z.string(),
  year: z.number().optional(),
  date: z.string().optional(),
  process: z.string().optional(),
  medium: z.string().optional(),
  dimensions: z.string().optional(),
  edition: z.string().optional(),
  collection: z.string().optional(),
  postProcessing: z.string().optional(),
  captureMethod: z.string().optional(),
  orientationNotes: z.string().optional(),
  artistWebsite: z.string().optional(),
  archivalLink: z.string().optional(),
  transientLink: z.string().optional(),
  discoveredForms: z.string().optional(),
  perceptualNotes: z.string().optional(),
  rotationalObservations: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const ArchiveExportSettingsSchema = z.object({
  standaloneHtml: z.string().default("perception.html"),
  includeWebpFallback: z.boolean().default(true),
  preset: z.enum(["archival", "mint-optimized", "collector-lightweight"]).default("archival"),
});

export const ArchiveEntrySchema = z.object({
  version: z.literal(ARCHIVE_VERSION),
  accessionId: z.string().optional(),
  slug: z.string().min(1),
  status: DraftStatusSchema.default("published"),
  metadata: ArchiveMetadataFieldsSchema,
  assets: ArchiveAssetsSchema,
  perception: ArchivePerceptionSchema,
  export: ArchiveExportSettingsSchema,
  provenance: ProvenanceRecordSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
  mintedAt: z.string().optional(),
});

export const ArchiveStatesFileSchema = z.object({
  version: z.literal(ARCHIVE_VERSION),
  slug: z.string(),
  perception: ArchivePerceptionSchema,
  exportedAt: z.string(),
});

export const ArchiveDraftSchema = z.object({
  accessionId: z.string().optional(),
  status: DraftStatusSchema.optional(),
  slug: z.string().min(1),
  artwork: z.object({
    id: z.string(),
    metadata: ArchiveMetadataFieldsSchema,
    imageSrc: z.string(),
    states: z.array(PerceptualStateSchema),
    background: z.union([
      z.enum(["black", "paper", "gallery", "archival", "custom"]),
      z.string(),
    ]),
    initialAngle: z.number().optional(),
    snapToState: z.boolean().optional(),
    showMetadataOverlay: z.boolean().optional(),
    overlayFields: OverlayFieldsSchema,
  }),
  provenance: ProvenanceRecordSchema.optional(),
  customBackground: z.string().optional(),
  export: ArchiveExportSettingsSchema.partial().optional(),
});

export const DraftSourceSchema = z.object({
  originalFilename: z.string().optional(),
  storedFilename: z.string().optional(),
  mimeType: z.string().optional(),
  byteSize: z.number().optional(),
  importedAt: z.string().optional(),
});

export const AccessionDraftSchema = z.object({
  version: z.literal(ARCHIVE_VERSION),
  draftId: z.string().min(1),
  accessionId: z.string().min(1),
  status: DraftStatusSchema,
  slug: z.string().min(1),
  slugLocked: z.boolean().default(false),
  slugHistory: z.array(z.string()).default([]),
  source: DraftSourceSchema.default({}),
  artwork: ArchiveDraftSchema.shape.artwork,
  provenance: ProvenanceRecordSchema,
  export: ArchiveExportSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  preparedAt: z.string().optional(),
  generatedAt: z.string().optional(),
  publishedAt: z.string().optional(),
  mintedAt: z.string().optional(),
  withdrawnAt: z.string().optional(),
});

export const AccessionDraftUpdateSchema = AccessionDraftSchema.partial().extend({
  draftId: z.string().optional(),
  accessionId: z.string().optional(),
  slug: z.string().optional(),
});

export const CreateAccessionDraftSchema = z.object({
  title: z.string().optional(),
  date: z.string().optional(),
  slug: z.string().optional(),
});

export const SlugUpdateSchema = z.object({
  slug: z.string().min(1),
  lock: z.boolean().optional(),
});

export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;
export type ProvenanceLink = z.infer<typeof ProvenanceLinkSchema>;
export type DraftStatus = z.infer<typeof DraftStatusSchema>;
export type ArchiveAssets = z.infer<typeof ArchiveAssetsSchema>;
export type ArchivePerception = z.infer<typeof ArchivePerceptionSchema>;
export type ArchiveEntry = z.infer<typeof ArchiveEntrySchema>;
export type ArchiveStatesFile = z.infer<typeof ArchiveStatesFileSchema>;
export type ArchiveDraft = z.infer<typeof ArchiveDraftSchema>;
export type AccessionDraft = z.infer<typeof AccessionDraftSchema>;
export type AccessionDraftUpdate = z.infer<typeof AccessionDraftUpdateSchema>;
export type CreateAccessionDraftInput = z.infer<typeof CreateAccessionDraftSchema>;
export type SlugUpdateInput = z.infer<typeof SlugUpdateSchema>;
export type DraftSource = z.infer<typeof DraftSourceSchema>;

export function emptyProvenance(): ProvenanceRecord {
  return { mint: [], auction: [], marketplace: [] };
}

export function defaultArchiveAssets(slug: string): ArchiveAssets {
  const base = `/archive/${slug}`;
  return {
    artwork: `${base}/artwork.avif`,
    preview: `${base}/preview.avif`,
    previewWebp: `${base}/preview.webp`,
    social: `${base}/social.jpg`,
    socialJpg: `${base}/social.jpg`,
    thumb: `${base}/thumb.jpg`,
  };
}

export function normalizeArchiveSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function buildArchiveSlug(date: string, title: string): string {
  const datePart = date.slice(0, 10);
  const slugTitle = normalizeArchiveSlug(title).slice(0, 48);
  return `${datePart}-${slugTitle || "untitled"}`;
}

export function createDefaultDraftArtwork(
  title = "",
  accessionId?: string,
): AccessionDraft["artwork"] {
  return {
    id: "draft",
    metadata: {
      accessionId,
      title,
      year: new Date().getFullYear(),
      date: new Date().toISOString().slice(0, 10),
    },
    imageSrc: "",
    states: [{ id: "s1", name: "", angle: 0, caption: "" }],
    background: "paper",
    initialAngle: 0,
    snapToState: true,
    showMetadataOverlay: true,
  };
}

export function sourceFilenameForUpload(filename: string): string {
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  return `original${ext.replace(/[^a-z0-9.]/g, "") || ".bin"}`;
}

export function formatAccessionId(year: number, sequence: number): string {
  return `AR-${year}-${String(sequence).padStart(4, "0")}`;
}

export function formatDraftId(year: number, sequence: number): string {
  return `draft-${year}-${String(sequence).padStart(4, "0")}`;
}
