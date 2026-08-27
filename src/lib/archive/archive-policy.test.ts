import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveStatusFromDraft,
  bytesForArchiveDerivativeGenerate,
  bytesForArchiveSourceDeposit,
} from "./archive-policy.ts";

describe("archiveStatusFromDraft", () => {
  it("maps generate-time draft statuses to generated, not published", () => {
    assert.equal(archiveStatusFromDraft("draft"), "generated");
    assert.equal(archiveStatusFromDraft("prepared"), "generated");
    assert.equal(archiveStatusFromDraft("generated"), "generated");
    assert.equal(archiveStatusFromDraft(undefined), "generated");
  });

  it("preserves terminal archive statuses", () => {
    assert.equal(archiveStatusFromDraft("published"), "published");
    assert.equal(archiveStatusFromDraft("minted"), "minted");
    assert.equal(archiveStatusFromDraft("hidden"), "hidden");
    assert.equal(archiveStatusFromDraft("withdrawn"), "withdrawn");
  });
});

describe("archive deposit vs derivative buffers", () => {
  it("deposits original bytes into source/, never prepared bytes", () => {
    const original = Buffer.from("original-bytes");
    const prepared = Buffer.from("prepared-bytes");
    assert.equal(bytesForArchiveSourceDeposit(original, prepared), original);
  });

  it("uses prepared bytes for derivatives when present", () => {
    const original = Buffer.from("original-bytes");
    const prepared = Buffer.from("prepared-bytes");
    assert.equal(bytesForArchiveDerivativeGenerate(original, prepared), prepared);
  });

  it("falls back to original bytes for derivatives when prepared is absent", () => {
    const original = Buffer.from("original-bytes");
    assert.equal(bytesForArchiveDerivativeGenerate(original, null), original);
  });
});
