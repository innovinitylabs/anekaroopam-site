import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateMetadataCommitMedia } from "./metadata-commit-media";

describe("validateMetadataCommitMedia", () => {
  it("rejects missing accession/revision", () => {
    const result = validateMetadataCommitMedia({
      objects: [
        {
          key: "archive/AR-2026-0001/r1/original/original.jpg",
          contentType: "image/jpeg",
          contentLength: 10,
        },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /accessionId|revision/i);
    }
  });

  it("rejects unauthorized object keys", () => {
    const result = validateMetadataCommitMedia({
      accessionId: "AR-2026-0001",
      revision: 1,
      objects: [
        {
          key: "evil/outside",
          contentType: "image/jpeg",
          contentLength: 10,
        },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Unauthorized object key/i);
    }
  });

  it("rejects keys for the wrong revision", () => {
    const result = validateMetadataCommitMedia({
      accessionId: "AR-2026-0001",
      revision: 2,
      objects: [
        {
          key: "archive/AR-2026-0001/r1/original/original.jpg",
          contentType: "image/jpeg",
          contentLength: 10,
        },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("accepts valid archive object refs", () => {
    const result = validateMetadataCommitMedia({
      accessionId: "AR-2026-0001",
      revision: 1,
      objects: [
        {
          key: "archive/AR-2026-0001/r1/original/original.jpg",
          contentType: "image/jpeg",
          contentLength: 100,
        },
        {
          key: "archive/AR-2026-0001/r1/derivatives/artwork.avif",
          contentType: "image/avif",
          contentLength: 50,
        },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.media.objects.length, 2);
    }
  });
});
