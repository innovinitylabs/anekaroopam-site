import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverCropRect,
  fitInsideMaxEdge,
} from "./browser-image-geometry.ts";
import { buildBrowserMetadataPackage } from "./browser-metadata-package.ts";
import { ARCHIVE_VERSION, type AccessionDraft } from "./schema.ts";
import {
  archiveImageOutputFilenames,
  ARCHIVE_IMAGE_OUTPUTS,
} from "./image-specs.ts";
import { canonicalPublicDerivativeFilenames } from "./public-derivative-export.ts";

describe("browser image geometry", () => {
  it("fitInsideMaxEdge leaves small images unchanged", () => {
    assert.deepEqual(fitInsideMaxEdge(800, 600, 2048), {
      width: 800,
      height: 600,
    });
  });

  it("fitInsideMaxEdge scales by longest edge", () => {
    assert.deepEqual(fitInsideMaxEdge(4000, 2000, 2048), {
      width: 2048,
      height: 1024,
    });
    assert.deepEqual(fitInsideMaxEdge(1000, 3000, 480), {
      width: 160,
      height: 480,
    });
  });

  it("coverCropRect center-crops wide sources for 1200x630", () => {
    const crop = coverCropRect(2000, 1000, 1200, 630);
    assert.ok(Math.abs(crop.sw / crop.sh - 1200 / 630) < 1e-6);
    assert.equal(crop.sy, 0);
    assert.ok(crop.sx > 0);
  });

  it("coverCropRect center-crops tall sources for 1200x630", () => {
    const crop = coverCropRect(1000, 2000, 1200, 630);
    assert.ok(Math.abs(crop.sw / crop.sh - 1200 / 630) < 1e-6);
    assert.equal(crop.sx, 0);
    assert.ok(crop.sy > 0);
  });
});

describe("browser derivative filenames", () => {
  it("match server canonicalPublicDerivativeFilenames", () => {
    assert.deepEqual(
      archiveImageOutputFilenames().sort(),
      canonicalPublicDerivativeFilenames().sort(),
    );
    assert.deepEqual(
      [
        ARCHIVE_IMAGE_OUTPUTS.artwork.filename,
        ARCHIVE_IMAGE_OUTPUTS.previewAvif.filename,
        ARCHIVE_IMAGE_OUTPUTS.previewWebp.filename,
        ARCHIVE_IMAGE_OUTPUTS.socialJpg.filename,
        ARCHIVE_IMAGE_OUTPUTS.thumbJpg.filename,
      ].sort(),
      canonicalPublicDerivativeFilenames().sort(),
    );
  });
});

describe("browser metadata package", () => {
  it("emits metadata, states, notes, and draft sidecars under allowlisted prefixes", () => {
    const draft: AccessionDraft = {
      version: ARCHIVE_VERSION,
      draftId: "draft-2026-0001",
      accessionId: "AR-2026-0001",
      status: "prepared",
      slug: "2026-browser-pack",
      slugLocked: true,
      slugHistory: [],
      source: {
        kind: "original",
        originalFilename: "master.jpg",
        storedFilename: "master.jpg",
        mimeType: "image/jpeg",
        byteSize: 12,
        importedAt: "2026-01-01T00:00:00.000Z",
      },
      processing: {
        preparedSource: "working/master-prepared.avif",
        preparedAt: "2026-01-01T00:00:00.000Z",
      },
      artwork: {
        id: "2026-browser-pack",
        metadata: {
          title: "Browser Pack",
          date: "2026-01-01",
          accessionId: "AR-2026-0001",
        },
        imageSrc: "",
        states: [],
        background: "black",
      },
      provenance: { mint: [], auction: [], marketplace: [] },
      export: { standaloneHtml: "perception.html", includeWebpFallback: true },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const metas = archiveImageOutputFilenames().map((filename) => ({
      filename,
      width: 10,
      height: 10,
      byteSize: 4,
    }));

    const pack = buildBrowserMetadataPackage({
      draft,
      derivativeMetas: metas,
    });

    assert.equal(pack.slug, "2026-browser-pack");
    assert.equal(pack.entry.status, "generated");
    assert.equal(pack.draft.status, "generated");
    assert.equal(pack.entry.derivatives.length, 5);

    const paths = pack.files.map((f) => f.path).sort();
    assert.deepEqual(paths, [
      "content/archive/2026-browser-pack/metadata.json",
      "content/archive/2026-browser-pack/notes.md",
      "content/archive/2026-browser-pack/states.json",
      "content/drafts/draft-2026-0001/draft.json",
      "content/drafts/draft-2026-0001/states.json",
    ]);
  });
});
