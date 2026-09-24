import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserPutHeaders } from "./upload-auth-client";

describe("browserPutHeaders", () => {
  it("only sets Content-Type for browser PUT", () => {
    const headers = browserPutHeaders("image/jpeg");
    assert.deepEqual(headers, { "Content-Type": "image/jpeg" });
    assert.equal(
      Object.prototype.hasOwnProperty.call(headers, "Content-Length"),
      false,
    );
  });
});
