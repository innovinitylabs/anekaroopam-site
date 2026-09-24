import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserPresignedPutHeaders } from "./presign-headers";
import { publicUrlForR2Key, isAbsoluteMediaUrl } from "./public-url";

describe("browserPresignedPutHeaders", () => {
  it("includes Content-Type and never Content-Length", () => {
    const headers = browserPresignedPutHeaders("image/avif");
    assert.equal(headers["Content-Type"], "image/avif");
    assert.equal(
      Object.prototype.hasOwnProperty.call(headers, "Content-Length"),
      false,
    );
    assert.deepEqual(Object.keys(headers), ["Content-Type"]);
  });

  it("rejects empty content type", () => {
    assert.throws(() => browserPresignedPutHeaders("   "));
  });
});

describe("public-url (client-safe)", () => {
  it("builds absolute URLs without reading env secrets", () => {
    assert.equal(
      publicUrlForR2Key(
        "archive/AR-2026-0001/r1/derivatives/thumb.jpg",
        "https://media.example.com/",
      ),
      "https://media.example.com/archive/AR-2026-0001/r1/derivatives/thumb.jpg",
    );
    assert.equal(isAbsoluteMediaUrl("https://media.example.com/x"), true);
    assert.equal(isAbsoluteMediaUrl("/archive/x"), false);
  });

  it("requires a public base URL", () => {
    assert.throws(() => publicUrlForR2Key("archive/x", "  "));
  });
});
