import assert from "node:assert/strict";
import test from "node:test";
import {
  generateSeoFromMetadata,
  isMetadataFinalized,
  readSeoFromMetadata,
} from "./archive-seo";

test("generateSeoFromMetadata uses only provided fields", () => {
  const seo = generateSeoFromMetadata({
    slug: "2026-01-01-test-work",
    metadata: {
      title: "Test Work",
      year: 2026,
      process: "Valiroopam",
      accessionId: "AR-2026-0001",
    },
  });
  assert.equal(seo.pageTitle, "Test Work (2026)");
  assert.match(seo.description, /Test Work/);
  assert.match(seo.description, /AR-2026-0001/);
  assert.equal(seo.reviewed, false);
  assert.equal(seo.canonicalPath, "/archive/2026-01-01-test-work");
  assert.equal((seo.schemaOrg as { name: string }).name, "Test Work");
  assert.ok(!seo.description.toLowerCase().includes("award"));
});

test("isMetadataFinalized requires title year process", () => {
  assert.equal(isMetadataFinalized({ title: "A", year: 2026, process: "P" }), true);
  assert.equal(isMetadataFinalized({ title: "A", year: 2026 }), false);
  assert.equal(isMetadataFinalized({ title: "", year: 2026, process: "P" }), false);
});

test("readSeoFromMetadata parses nested seo", () => {
  const seo = generateSeoFromMetadata({
    slug: "x",
    metadata: { title: "X", year: 2025, process: "Y" },
  });
  const read = readSeoFromMetadata({ title: "X", seo });
  assert.ok(read);
  assert.equal(read?.pageTitle, seo.pageTitle);
  assert.equal(readSeoFromMetadata({ title: "X" }), null);
});
