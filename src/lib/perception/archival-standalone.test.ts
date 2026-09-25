import assert from "node:assert/strict";
import test from "node:test";
import { buildStandaloneHtmlFromBuffers } from "../archive/standalone-html.ts";
import {
  assertOnchainStandaloneHtml,
  countDataUrlOccurrences,
} from "../html-export/standalone-profile.ts";
import { STANDALONE_RUNTIME_MARKERS } from "../html-export/build-html.ts";
import type { ExportPayload } from "./types.ts";

const AVIF = Buffer.from("fake-avif-bytes-archival-test-content");
const WEBP = Buffer.from("fake-webp-bytes-archival-test-content");

const payload: ExportPayload = {
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  artwork: {
    id: "archival-1",
    metadata: { title: "Archival Fixture", accessionId: "AR-2026-0001" },
    imageSrc: "https://example.com/must-not-leak.png",
    states: [{ id: "s0", name: "Upright", angle: 0 }],
    background: "#f4f0e8",
    initialAngle: 0,
    showMetadataOverlay: true,
  },
};

test("onchain archival HTML is self-contained: embedded AVIF, no externals, no WebP", async () => {
  process.env.ARCHIVE_IMAGE_PIPELINE_TEST = "1";
  const result = await buildStandaloneHtmlFromBuffers(payload, AVIF, WEBP, {
    profile: "onchain",
  });
  assertOnchainStandaloneHtml(result.html);
  assert.equal(countDataUrlOccurrences(result.html, "image/avif"), 1);
  assert.equal(countDataUrlOccurrences(result.html, "image/webp"), 0);
  assert.doesNotMatch(result.html, /https?:\/\//i);
  assert.doesNotMatch(result.html, /example\.com/);
  assert.doesNotMatch(result.html, /<script\s+[^>]*src=/i);
  assert.doesNotMatch(result.html, /<link\s+[^>]*rel=["']stylesheet/i);
  assert.doesNotMatch(result.html, /fonts\.googleapis/i);
  for (const marker of STANDALONE_RUNTIME_MARKERS) {
    assert.match(
      result.html,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.ok(result.htmlByteSize > 0);
  assert.equal(result.embeddedWebpByteSize, null);
});

test("compatible archival HTML embeds AVIF and may include WebP without network deps", async () => {
  process.env.ARCHIVE_IMAGE_PIPELINE_TEST = "1";
  const result = await buildStandaloneHtmlFromBuffers(payload, AVIF, WEBP, {
    profile: "compatible",
  });
  assert.match(result.html, /data:image\/avif/i);
  assert.match(result.html, /data:image\/webp/i);
  assert.doesNotMatch(result.html, /<script\s+[^>]*src=/i);
  assert.doesNotMatch(result.html, /fonts\.googleapis/i);
  assert.doesNotMatch(result.html, /example\.com/);
  assert.match(result.html, /var idleTimer = null/);
  assert.match(result.html, /displayAsset/);
});

test("compatible without WebP fallback does not silently keep unused WebP", async () => {
  process.env.ARCHIVE_IMAGE_PIPELINE_TEST = "1";
  const result = await buildStandaloneHtmlFromBuffers(payload, AVIF, WEBP, {
    profile: "compatible",
    includeWebpFallback: false,
  });
  assert.match(result.html, /data:image\/avif/i);
  assert.doesNotMatch(result.html, /data:image\/webp/i);
  assert.equal(result.embeddedWebpByteSize, null);
});
