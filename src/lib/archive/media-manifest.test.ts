import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildR2MediaBlock, nextMediaRevision } from "./media-manifest";

describe("media-manifest", () => {
  it("builds absolute asset URLs and r2 media block", () => {
    const built = buildR2MediaBlock({
      accessionId: "AR-2026-0007",
      revision: 2,
      storedFilename: "original.png",
      publicBaseUrl: "https://media.example.com",
      original: {
        mimeType: "image/png",
        byteSize: 100,
      },
      prepared: {
        mimeType: "image/avif",
        byteSize: 50,
        width: 10,
        height: 10,
      },
      derivatives: [
        {
          filename: "artwork.avif",
          mimeType: "image/avif",
          byteSize: 40,
          width: 10,
          height: 10,
        },
        {
          filename: "preview.avif",
          mimeType: "image/avif",
          byteSize: 30,
          width: 10,
          height: 10,
        },
        {
          filename: "preview.webp",
          mimeType: "image/webp",
          byteSize: 30,
          width: 10,
          height: 10,
        },
        {
          filename: "social.jpg",
          mimeType: "image/jpeg",
          byteSize: 20,
          width: 1200,
          height: 630,
        },
        {
          filename: "thumb.jpg",
          mimeType: "image/jpeg",
          byteSize: 10,
          width: 480,
          height: 480,
        },
      ],
    });

    assert.equal(built.media.storage, "r2");
    assert.equal(built.media.revision, 2);
    assert.equal(
      built.assets.artwork,
      "https://media.example.com/archive/AR-2026-0007/r2/derivatives/artwork.avif",
    );
    assert.equal(
      built.derivatives[0]?.path.startsWith("https://media.example.com/"),
      true,
    );
  });

  it("increments revision from existing media", () => {
    assert.equal(nextMediaRevision(null), 1);
    assert.equal(
      nextMediaRevision({
        schemaVersion: 1,
        storage: "r2",
        accessionId: "AR-2026-0001",
        revision: 3,
        original: {
          key: "archive/AR-2026-0001/r3/original/original.jpg",
          mimeType: "image/jpeg",
          byteSize: 1,
        },
        derivatives: [],
      }),
      4,
    );
  });
});
