import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAccessionRuntime } from "./runtime.ts";
import {
  ArchiveEntrySchema,
  r2ArchiveAssets,
} from "./schema.ts";

/** Mirrors listAllArtworks thumb selection for unit coverage. */
function galleryThumbSrc(entry: ReturnType<typeof ArchiveEntrySchema.parse>): string {
  return (
    buildAccessionRuntime(entry).derivatives.find((d) => d.role === "thumb")
      ?.path ?? entry.assets.thumb
  );
}

describe("gallery thumb imageSrc", () => {
  it("selects absolute R2 thumb URL from derivatives for the grid", () => {
    const assets = r2ArchiveAssets("https://media.example.com", {
      artwork: "archive/ACC-1/r1/derivatives/artwork.avif",
      preview: "archive/ACC-1/r1/derivatives/preview.avif",
      previewWebp: "archive/ACC-1/r1/derivatives/preview.webp",
      social: "archive/ACC-1/r1/derivatives/social.jpg",
      thumb: "archive/ACC-1/r1/derivatives/thumb.jpg",
    });
    const entry = ArchiveEntrySchema.parse({
      version: 1,
      slug: "2026-09-24-r2-sample",
      status: "published",
      metadata: { title: "R2 sample", year: 2026 },
      assets,
      derivatives: [
        {
          role: "thumb",
          path: assets.thumb,
          format: "jpeg",
          generatedAt: "2026-09-24T00:00:00.000Z",
        },
      ],
      perception: {
        states: [],
        background: "paper",
        initialAngle: 0,
        snapToState: true,
        showMetadataOverlay: true,
      },
      export: { standaloneHtml: "perception.html", includeWebpFallback: true },
      provenance: {
        platform: "",
        collector: "",
        notes: "",
        edition: "",
        certificateUrl: "",
        transfers: [],
      },
      createdAt: "2026-09-24T00:00:00.000Z",
      updatedAt: "2026-09-24T00:00:00.000Z",
    });

    const imageSrc = galleryThumbSrc(entry);
    assert.equal(
      imageSrc,
      "https://media.example.com/archive/ACC-1/r1/derivatives/thumb.jpg",
    );
    // ArchiveGrid sets unoptimized for absolute CDN URLs so next/image
    // does not route them through /_next/image without remotePatterns.
    assert.equal(/^https?:\/\//i.test(imageSrc), true);
  });

  it("falls back to relative assets.thumb for legacy FS entries", () => {
    const entry = ArchiveEntrySchema.parse({
      version: 1,
      slug: "2026-05-19-legacy",
      status: "published",
      metadata: { title: "Legacy", year: 2026 },
      assets: {
        artwork: "/archive/2026-05-19-legacy/artwork.avif",
        preview: "/archive/2026-05-19-legacy/preview.avif",
        social: "/archive/2026-05-19-legacy/social.avif",
        thumb: "/archive/2026-05-19-legacy/thumb.avif",
      },
      derivatives: [],
      perception: {
        states: [],
        background: "paper",
        initialAngle: 0,
        snapToState: true,
        showMetadataOverlay: true,
      },
      export: { standaloneHtml: "perception.html", includeWebpFallback: true },
      provenance: {
        platform: "",
        collector: "",
        notes: "",
        edition: "",
        certificateUrl: "",
        transfers: [],
      },
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
    });

    const imageSrc = galleryThumbSrc(entry);
    assert.equal(imageSrc, "/archive/2026-05-19-legacy/thumb.avif");
    assert.equal(/^https?:\/\//i.test(imageSrc), false);
  });
});
