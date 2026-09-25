import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAdminJson } from "./admin-response.ts";
import {
  assertCommitBundleClientLimits,
  DEFAULT_MAX_SOURCE_BYTES,
  formatByteSize,
  isSourceWithinLimit,
  MAX_BUNDLE_BINARY_BYTES,
  MAX_SOURCE_BYTES,
  resolveMaxSourceBytes,
} from "./commit-bundle-limits.ts";

describe("commit-bundle client limits", () => {
  it("rejects oversized source before upload", () => {
    assert.throws(
      () =>
        assertCommitBundleClientLimits({
          sourceBytes: MAX_SOURCE_BYTES + 1,
          binaryBytes: 100,
        }),
      /Source file/,
    );
  });

  it("accepts source at the shared 10 MB limit", () => {
    assert.doesNotThrow(() =>
      assertCommitBundleClientLimits({
        sourceBytes: MAX_SOURCE_BYTES,
        binaryBytes: 100,
      }),
    );
    assert.equal(isSourceWithinLimit(2_685_375), true);
  });

  it("rejects oversized binary total", () => {
    assert.throws(
      () =>
        assertCommitBundleClientLimits({
          sourceBytes: 100,
          binaryBytes: MAX_BUNDLE_BINARY_BYTES + 1,
        }),
      /Total binary bundle/,
    );
  });

  it("formats byte sizes", () => {
    assert.match(formatByteSize(2048), /KB/);
    assert.match(formatByteSize(MAX_SOURCE_BYTES), /10\.00 MB/);
  });

  it("resolveMaxSourceBytes defaults to 10 MiB and honors env", () => {
    assert.equal(DEFAULT_MAX_SOURCE_BYTES, 10 * 1024 * 1024);
    const previous = process.env.ARCHIVE_MAX_SOURCE_BYTES;
    delete process.env.ARCHIVE_MAX_SOURCE_BYTES;
    delete process.env.NEXT_PUBLIC_ARCHIVE_MAX_SOURCE_BYTES;
    try {
      assert.equal(resolveMaxSourceBytes(), DEFAULT_MAX_SOURCE_BYTES);
      process.env.ARCHIVE_MAX_SOURCE_BYTES = String(20 * 1024 * 1024);
      assert.equal(resolveMaxSourceBytes(), 20 * 1024 * 1024);
      assert.equal(isSourceWithinLimit(15 * 1024 * 1024), true);
    } finally {
      if (previous === undefined) {
        delete process.env.ARCHIVE_MAX_SOURCE_BYTES;
      } else {
        process.env.ARCHIVE_MAX_SOURCE_BYTES = previous;
      }
    }
  });
});

describe("readAdminJson", () => {
  it("surfaces 413 plaintext as a useful error", async () => {
    const res = new Response("Request Entity Too Large", {
      status: 413,
      headers: { "content-type": "text/plain" },
    });
    const parsed = await readAdminJson(res);
    assert.equal(parsed.ok, false);
    assert.match(parsed.data.error ?? "", /413|too large/i);
    assert.match(parsed.data.error ?? "", /10\.00 MB/);
  });

  it("parses JSON errors when present", async () => {
    const res = new Response(JSON.stringify({ error: "boom" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    const parsed = await readAdminJson(res);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.data.error, "boom");
  });
});
