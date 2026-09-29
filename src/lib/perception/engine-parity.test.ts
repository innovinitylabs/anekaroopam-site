import assert from "node:assert/strict";
import test from "node:test";
import {
  clampZoom,
  clickRotationDirection,
  getActiveState,
  rotateByDirection,
  wheelZoomDelta,
  keyboardZoomDelta,
  exceedsDragThreshold,
  shouldIgnoreStageClick,
  PERCEPTION_IDLE_MS,
  PERCEPTION_INTERPOLATE_MS,
  PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  PERCEPTION_WHEEL_ZOOM_DELTA,
  PERCEPTION_KEYBOARD_ZOOM_DELTA,
  PERCEPTION_DRAG_THRESHOLD_PX,
} from "./engine.ts";
import { STANDALONE_EMITTED_CONSTANTS } from "./emit-standalone-runtime.ts";
import { buildStandaloneHtml } from "../html-export/build-html.ts";
import type { ExportPayload, PerceptualState } from "./types.ts";

const states: PerceptualState[] = [
  { id: "a", name: "A", angle: 0 },
  { id: "b", name: "B", angle: 90 },
];

test("emitted standalone constants match shared engine constants", () => {
  assert.equal(STANDALONE_EMITTED_CONSTANTS.idleMs, PERCEPTION_IDLE_MS);
  assert.equal(
    STANDALONE_EMITTED_CONSTANTS.interpolateMs,
    PERCEPTION_INTERPOLATE_MS,
  );
  assert.equal(
    STANDALONE_EMITTED_CONSTANTS.stateThreshold,
    PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  );
  assert.equal(
    STANDALONE_EMITTED_CONSTANTS.wheelDelta,
    PERCEPTION_WHEEL_ZOOM_DELTA,
  );
  assert.equal(
    STANDALONE_EMITTED_CONSTANTS.keyZoom,
    PERCEPTION_KEYBOARD_ZOOM_DELTA,
  );
  assert.equal(STANDALONE_EMITTED_CONSTANTS.dragPx, PERCEPTION_DRAG_THRESHOLD_PX);
});

test("standalone HTML embeds shared constant literals from the emitter", () => {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    artwork: {
      id: "t1",
      metadata: { title: "Parity" },
      imageSrc: "",
      states,
      background: "paper",
      initialAngle: 0,
    },
  };
  const html = buildStandaloneHtml(payload);
  assert.match(html, new RegExp(String(PERCEPTION_IDLE_MS)));
  assert.match(html, /var idleTimer = null/);
  assert.match(html, /passive: false/);
  assert.match(html, /activeStateThreshold/);
  assert.match(html, /object-fit: contain/);
});

test("rotation and active-state thresholds are shared", () => {
  const t = { angle: 0, zoom: 1, panX: 0, panY: 0 };
  assert.equal(rotateByDirection(t, "cw", states, { snapToState: false }), 22.5);
  assert.equal(rotateByDirection(t, "cw", states, { snapToState: true }), 90);
  assert.equal(getActiveState(3, states)?.id, "a");
  assert.equal(getActiveState(20, states), null);
});

test("input helpers are consistent", () => {
  assert.equal(clickRotationDirection(10, 0, 100), "ccw");
  assert.equal(clickRotationDirection(60, 0, 100), "cw");
  assert.equal(wheelZoomDelta(-1), PERCEPTION_WHEEL_ZOOM_DELTA);
  assert.equal(wheelZoomDelta(1), -PERCEPTION_WHEEL_ZOOM_DELTA);
  assert.equal(keyboardZoomDelta("+"), PERCEPTION_KEYBOARD_ZOOM_DELTA);
  assert.equal(keyboardZoomDelta("-"), -PERCEPTION_KEYBOARD_ZOOM_DELTA);
  assert.equal(exceedsDragThreshold(3, 0), true);
  assert.equal(exceedsDragThreshold(1, 1), false);
  assert.equal(shouldIgnoreStageClick({ dragging: true, suppressClick: false }), true);
  assert.equal(clampZoom(0.01), STANDALONE_EMITTED_CONSTANTS.minZoom);
});
