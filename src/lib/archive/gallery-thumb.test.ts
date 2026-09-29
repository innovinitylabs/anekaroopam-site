import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVE_GALLERY_THUMB_CLASSNAME,
  ARCHIVE_GALLERY_THUMB_SIZES,
  resolveArchiveGalleryThumb,
} from "../content/archive-gallery-thumb.ts";
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
    const assets = r2ArchiveAssets("https://media.anekaroopam.art", {
      artwork: "archive/AR-2026-0021/r1/derivatives/artwork.avif",
      preview: "archive/AR-2026-0021/r1/derivatives/preview.avif",
      previewWebp: "archive/AR-2026-0021/r1/derivatives/preview.webp",
      social: "archive/AR-2026-0021/r1/derivatives/social.jpg",
      thumb: "archive/AR-2026-0021/r1/derivatives/thumb.jpg",
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
      "https://media.anekaroopam.art/archive/AR-2026-0021/r1/derivatives/thumb.jpg",
    );
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
  });
});

describe("resolveArchiveGalleryThumb rendering policy", () => {
  it("renders absolute R2 URLs as native img without /_next/image", () => {
    const src =
      "https://media.anekaroopam.art/archive/AR-2026-0021/r1/derivatives/thumb.jpg";
    const model = resolveArchiveGalleryThumb({
      src,
      alt: "Accession title",
      priority: true,
    });
    assert.equal(model.kind, "native");
    if (model.kind !== "native") return;
    assert.equal(model.src, src);
    assert.equal(model.alt, "Accession title");
    assert.equal(model.loading, "eager");
    assert.equal(model.decoding, "async");
    assert.equal(model.className, ARCHIVE_GALLERY_THUMB_CLASSNAME);
    assert.equal(model.style.position, "absolute");
    assert.equal(model.style.height, "100%");
    assert.equal(model.style.width, "100%");
    assert.ok(!model.src.includes("/_next/image"));
  });

  it("keeps relative legacy URLs on next/image with fill sizing", () => {
    const src = "/archive/2026-05-19-legacy/thumb.avif";
    const model = resolveArchiveGalleryThumb({
      src,
      alt: "Legacy title",
      priority: false,
    });
    assert.equal(model.kind, "next-image");
    if (model.kind !== "next-image") return;
    assert.equal(model.src, src);
    assert.equal(model.alt, "Legacy title");
    assert.equal(model.fill, true);
    assert.equal(model.sizes, ARCHIVE_GALLERY_THUMB_SIZES);
    assert.equal(model.priority, false);
    assert.equal(model.className, ARCHIVE_GALLERY_THUMB_CLASSNAME);
  });

  it("preserves thumb fallback absolute URL through native render path", () => {
    const fallback =
      "https://media.anekaroopam.art/archive/AR-2026-0021/r1/derivatives/thumb.jpg";
    // Simulate listAllArtworks fallback: assets.thumb when derivatives empty.
    const imageSrc = fallback;
    const model = resolveArchiveGalleryThumb({
      src: imageSrc,
      alt: "Fallback thumb",
    });
    assert.equal(model.kind, "native");
    assert.equal(model.src, fallback);
    assert.equal(model.alt, "Fallback thumb");
  });
});
