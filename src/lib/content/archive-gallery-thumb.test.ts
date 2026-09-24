import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVE_GALLERY_THUMB_CLASSNAME,
  ARCHIVE_GALLERY_THUMB_SIZES,
  resolveArchiveGalleryThumb,
} from "./archive-gallery-thumb";

describe("resolveArchiveGalleryThumb rendering policy", () => {
  it("renders absolute R2 URLs as native img without /_next/image", () => {
    const src =
      "https://media.anekaroopam.art/archive/AR-2026-0020/r1/derivatives/thumb.jpg";
    const model = resolveArchiveGalleryThumb({
      src,
      alt: "IMG_2814",
      priority: true,
    });
    assert.equal(model.kind, "native");
    if (model.kind !== "native") return;
    assert.equal(model.src, src);
    assert.equal(model.alt, "IMG_2814");
    assert.equal(model.loading, "eager");
    assert.equal(model.decoding, "async");
    assert.equal(model.className, ARCHIVE_GALLERY_THUMB_CLASSNAME);
    assert.equal(model.style.position, "absolute");
    assert.equal(model.style.height, "100%");
    assert.equal(model.style.width, "100%");
    assert.ok(!model.src.includes("/_next/image"));
  });

  it("keeps relative legacy URLs on next/image with fill sizing", () => {
    const src = "/archive/2026-05-19-02-devil-may-cry-or-block-you/thumb.avif";
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
      "https://media.anekaroopam.art/archive/AR-2026-0021/r2/derivatives/thumb.jpg";
    const model = resolveArchiveGalleryThumb({
      src: fallback,
      alt: "Fallback thumb",
    });
    assert.equal(model.kind, "native");
    assert.equal(model.src, fallback);
    assert.equal(model.alt, "Fallback thumb");
    assert.equal(model.className, ARCHIVE_GALLERY_THUMB_CLASSNAME);
  });
});
