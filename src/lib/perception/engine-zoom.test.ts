import assert from "node:assert/strict";
import test from "node:test";
import {
  clampZoom,
  defaultTransform,
  PERCEPTION_WHEEL_LISTENER_OPTIONS,
} from "./engine.ts";
import { DEFAULT_ENGINE_OPTIONS } from "./types.ts";

test("defaultTransform starts at fit baseline zoom 1", () => {
  const t = defaultTransform(15);
  assert.equal(t.zoom, 1);
  assert.equal(t.angle, 15);
  assert.equal(t.panX, 0);
  assert.equal(t.panY, 0);
});

test("clampZoom respects default min and max", () => {
  assert.equal(clampZoom(0.1), DEFAULT_ENGINE_OPTIONS.minZoom);
  assert.equal(clampZoom(99), DEFAULT_ENGINE_OPTIONS.maxZoom);
  assert.equal(clampZoom(1), 1);
  assert.equal(clampZoom(1.08), 1.08);
});

test("wheel listener options require non-passive registration", () => {
  assert.equal(PERCEPTION_WHEEL_LISTENER_OPTIONS.passive, false);
});
