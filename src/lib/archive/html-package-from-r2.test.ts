import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleHtmlPackageZip,
  assembleOnchainHtmlPackageZip,
  assertPublishedForHtmlPackage,
  HTML_PACKAGE_EXPORT_VERSION,
} from "./html-package-from-r2.ts";
import type { WorkerArtworkDetail } from "./worker-client.ts";

test("assembleHtmlPackageZip includes mint-package-v1 required paths", () => {
  const { zip, files } = assembleHtmlPackageZip({
    perceptionHtml: "<html>viewer</html>",
    metadataJson: "{}",
    statesJson: "{}",
    manifestJson: "{}",
    provenanceTemplate: "{}",
    collectorNotes: "notes",
    derivatives: [
      { filename: "artwork.avif", data: Buffer.from("avif"), role: "artwork" },
      { filename: "thumb.jpg", data: Buffer.from("jpg"), role: "thumb" },
    ],
  });
  assert.ok(zip.length > 0);
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes("perception.html"));
  assert.ok(paths.includes("metadata.json"));
  assert.ok(paths.includes("manifest.json"));
  assert.ok(paths.includes("artwork.avif"));
  assert.ok(paths.includes("collector-notes.txt"));
  assert.equal(HTML_PACKAGE_EXPORT_VERSION, "mint-package-v1");
});

test("assembleOnchainHtmlPackageZip is HTML + size report only", () => {
  const { files } = assembleOnchainHtmlPackageZip({
    perceptionHtml: "<html>onchain</html>",
    sizeReport: {
      profile: "onchain",
      htmlByteSize: 18,
      embeddedAvifByteSize: 100,
      embeddedWebpByteSize: null,
    },
  });
  const paths = files.map((f) => f.path);
  assert.deepEqual(paths.sort(), ["perception.html", "size-report.json"].sort());
  assert.ok(!paths.includes("artwork.avif"));
  assert.ok(!paths.includes("preview.webp"));
});

test("assertPublishedForHtmlPackage rejects unpublished", () => {
  const detail = {
    artwork: {
      id: "a1",
      accessionId: "AR-2026-0001",
      draftId: "draft-1",
      slug: "2026-01-01-x",
      status: "ready",
      workingRevision: 2,
      publishedRevision: null,
      title: "X",
      year: null,
      process: null,
      thumbObjectKey: null,
      createdAt: "",
      updatedAt: "",
      publishedAt: null,
      hiddenAt: null,
      withdrawnAt: null,
      createdBy: null,
    },
    workingRevision: null,
    publishedRevision: null,
    assets: [],
    readiness: { ok: false, missing: [] },
  } as WorkerArtworkDetail;

  assert.throws(() => assertPublishedForHtmlPackage(detail), /published/i);
});

test("assertPublishedForHtmlPackage accepts published with artwork asset", () => {
  const detail = {
    artwork: {
      id: "a1",
      accessionId: "AR-2026-0001",
      draftId: "draft-1",
      slug: "2026-01-01-x",
      status: "published",
      workingRevision: 2,
      publishedRevision: 1,
      title: "X",
      year: null,
      process: null,
      thumbObjectKey: null,
      createdAt: "",
      updatedAt: "",
      publishedAt: "",
      hiddenAt: null,
      withdrawnAt: null,
      createdBy: null,
    },
    workingRevision: null,
    publishedRevision: {
      revision: 1,
      kind: "frozen",
      metadata: { title: "X" },
      perception: { states: [] },
      export: {},
      provenance: { mint: [] },
    },
    assets: [],
    publishedAssets: [
      {
        role: "artwork",
        object_key: "archive/AR-2026-0001/r1/artwork.avif",
        mime_type: "image/avif",
        byte_size: 10,
        verified_at: "2026-01-01T00:00:00.000Z",
        width: 1,
        height: 1,
      },
    ],
    readiness: { ok: true, missing: [] },
  } as WorkerArtworkDetail;

  const published = assertPublishedForHtmlPackage(detail);
  assert.equal(published.revision, 1);
  assert.equal(published.assets[0]?.role, "artwork");
});
