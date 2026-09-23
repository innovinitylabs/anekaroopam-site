import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAdminJson } from "./admin-response.ts";
import {
  assertCommitBundleClientLimits,
  formatByteSize,
  MAX_BUNDLE_BINARY_BYTES,
  MAX_SOURCE_BYTES,
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
