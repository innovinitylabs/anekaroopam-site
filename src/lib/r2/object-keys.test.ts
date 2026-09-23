import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAllRevisionKeys,
  buildDerivativeKey,
  buildOriginalKey,
  buildPreparedKey,
  isAllowedArchiveObjectKey,
  parseAccessionRevisionFromKey,
} from "./object-keys";

describe("r2 object-keys", () => {
  it("builds deterministic revision keys", () => {
    const keys = buildAllRevisionKeys({
      accessionId: "AR-2026-0001",
      revision: 1,
      storedFilename: "original.jpg",
    });
    assert.equal(
      keys.original,
      "archive/AR-2026-0001/r1/original/original.jpg",
    );
    assert.equal(
      keys.prepared,
      "archive/AR-2026-0001/r1/prepared/master-prepared.avif",
    );
    assert.equal(
      keys.derivatives.artwork,
      "archive/AR-2026-0001/r1/derivatives/artwork.avif",
    );
    assert.equal(keys.all.length, 7);
  });

  it("rejects invalid accession ids and filenames", () => {
    assert.throws(() =>
      buildOriginalKey("local-abc", 1, "original.jpg"),
    );
    assert.throws(() =>
      buildOriginalKey("AR-2026-0001", 0, "original.jpg"),
    );
    assert.throws(() =>
      buildOriginalKey("AR-2026-0001", 1, "evil.png"),
    );
    assert.throws(() =>
      buildDerivativeKey("AR-2026-0001", 1, "not-a-spec.bin"),
    );
  });

  it("validates allowed keys for an accession revision", () => {
    const key = buildPreparedKey("AR-2026-0002", 3);
    assert.equal(isAllowedArchiveObjectKey(key, "AR-2026-0002", 3), true);
    assert.equal(isAllowedArchiveObjectKey(key, "AR-2026-0002", 2), false);
    assert.equal(
      isAllowedArchiveObjectKey(
        "archive/AR-2026-0002/r3/../other",
        "AR-2026-0002",
        3,
      ),
      false,
    );
  });

  it("parses accession and revision from keys", () => {
    const parsed = parseAccessionRevisionFromKey(
      "archive/AR-2026-0042/r2/derivatives/thumb.jpg",
    );
    assert.deepEqual(parsed, { accessionId: "AR-2026-0042", revision: 2 });
    assert.equal(parseAccessionRevisionFromKey("public/archive/x"), null);
  });
});
