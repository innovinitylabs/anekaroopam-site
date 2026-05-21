/** Shared output specs for server Sharp pipeline (aligned with client presets conceptually). */

export const ARCHIVE_IMAGE_OUTPUTS = {
  artwork: {
    filename: "artwork.avif",
    format: "avif",
    maxEdge: undefined as number | undefined,
    quality: 82,
    effort: 6,
  },
  previewAvif: {
    filename: "preview.avif",
    format: "avif",
    maxEdge: 2048,
    quality: 78,
    effort: 5,
  },
  previewWebp: {
    filename: "preview.webp",
    format: "webp",
    maxEdge: 2048,
    quality: 78,
  },
  socialJpg: {
    filename: "social.jpg",
    format: "jpeg",
    width: 1200,
    height: 630,
    fit: "cover" as const,
    quality: 82,
  },
  thumbJpg: {
    filename: "thumb.jpg",
    format: "jpeg",
    maxEdge: 480,
    quality: 76,
  },
} as const;

export type ArchiveImageVariant = keyof typeof ARCHIVE_IMAGE_OUTPUTS;
