import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStandaloneHtml,
  STANDALONE_RUNTIME_MARKERS,
} from "./build-html.ts";
import type { ExportPayload } from "@/lib/perception/types";

const minimalPayload: ExportPayload = {
  artwork: {
    id: "test",
    imageSrc: "data:image/png;base64,xx",
    background: "#f4f0e8",
    initialAngle: 0,
    snapToState: false,
    showMetadataOverlay: true,
    states: [{ id: "s1", angle: 0, name: "Front", caption: "" }],
    metadata: { title: "Test Work", year: 2026, process: "Valiroopam" },
  },
};

test("standalone HTML declares idleTimer, DURATION, passive wheel, and state threshold", () => {
  const html = buildStandaloneHtml(minimalPayload);
  for (const marker of STANDALONE_RUNTIME_MARKERS) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /var idleTimer = null/);
  assert.match(html, /DURATION = CONFIG\.interpolateMs/);
  assert.match(html, /function activeState/);
  assert.match(html, /object-fit:\s*contain/);
  assert.doesNotMatch(html, /88vmin/);
});
