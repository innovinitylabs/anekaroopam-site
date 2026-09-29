import assert from "node:assert/strict";
import test from "node:test";
import { buildStandaloneHtmlFromBuffers } from "../archive/standalone-html.ts";
import {
  assertOnchainStandaloneHtml,
  countDataUrlOccurrences,
} from "./standalone-profile.ts";
import {
  buildStandaloneHtml,
  STANDALONE_RUNTIME_MARKERS,
} from "./build-html.ts";
import type { ExportPayload } from "@/lib/perception/types";

const payload: ExportPayload = {
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  artwork: {
    id: "AR-2026-0001",
    imageSrc: "",
    background: "#f4f0e8",
    initialAngle: 0,
    snapToState: false,
    showMetadataOverlay: true,
    states: [{ id: "s1", angle: 0, name: "Front", caption: "face" }],
    metadata: { title: "Test Work", year: 2026, process: "Valiroopam" },
  },
};

// Minimal valid-looking AVIF/WebP byte stubs (pipeline test mode uses raw buffers)
const AVIF = Buffer.from("fake-avif-bytes-for-onchain-test");
const WEBP = Buffer.from("fake-webp-bytes-for-compatible-test");

test("standalone HTML declares idleTimer, DURATION, passive wheel, and state threshold", () => {
  const html = buildStandaloneHtml(payload);
  for (const marker of STANDALONE_RUNTIME_MARKERS) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /function activeState/);
  assert.match(html, /object-fit:\s*contain/);
  assert.doesNotMatch(html, /88vmin/);
});

test("onchain profile embeds AVIF once, excludes WebP and external refs, reports sizes", async () => {
  process.env.ARCHIVE_IMAGE_PIPELINE_TEST = "1";
  const result = await buildStandaloneHtmlFromBuffers(payload, AVIF, WEBP, {
    profile: "onchain",
  });
  assert.equal(result.profile, "onchain");
  assert.equal(result.embeddedAvifByteSize, AVIF.length);
  assert.equal(result.embeddedWebpByteSize, null);
  assert.ok(result.htmlByteSize > 0);
  assert.equal(result.htmlByteSize, Buffer.byteLength(result.html, "utf8"));

  assertOnchainStandaloneHtml(result.html);
  assert.equal(countDataUrlOccurrences(result.html, "image/avif"), 1);
  assert.equal(countDataUrlOccurrences(result.html, "image/webp"), 0);
  assert.doesNotMatch(result.html, /https?:\/\//i);
  assert.doesNotMatch(result.html, /r2\.cloudflarestorage/i);
  // Viewer controls preserved after minify
  assert.match(result.html, /function rotate/);
  assert.match(result.html, /passive:\s*false/);
  assert.match(result.html, /overlay-toggle|overlaysEnabled/);
  assert.match(result.html, /idleTimer/);
  // file:// safe: relative/data only
  assert.doesNotMatch(result.html, /src=["']https?:/i);
  delete process.env.ARCHIVE_IMAGE_PIPELINE_TEST;
});

test("compatible profile may embed WebP without changing onchain defaults", async () => {
  process.env.ARCHIVE_IMAGE_PIPELINE_TEST = "1";
  const compatible = await buildStandaloneHtmlFromBuffers(payload, AVIF, WEBP, {
    profile: "compatible",
  });
  assert.equal(compatible.profile, "compatible");
  assert.equal(compatible.embeddedWebpByteSize, WEBP.length);
  assert.match(compatible.html, /data:image\/avif/i);
  assert.match(compatible.html, /data:image\/webp/i);

  const onchain = await buildStandaloneHtmlFromBuffers(payload, AVIF, WEBP, {
    profile: "onchain",
  });
  assert.equal(onchain.embeddedWebpByteSize, null);
  assert.doesNotMatch(onchain.html, /data:image\/webp/i);
  // Profiles are independent: compatible HTML larger when WebP included
  assert.ok(compatible.htmlByteSize > onchain.htmlByteSize);
  delete process.env.ARCHIVE_IMAGE_PIPELINE_TEST;
});

test("embedded image is not duplicated in CONFIG when markup carries data URL", async () => {
  process.env.ARCHIVE_IMAGE_PIPELINE_TEST = "1";
  const result = await buildStandaloneHtmlFromBuffers(payload, AVIF, undefined, {
    profile: "onchain",
  });
  assert.equal(countDataUrlOccurrences(result.html, "image/avif"), 1);
  delete process.env.ARCHIVE_IMAGE_PIPELINE_TEST;
});
