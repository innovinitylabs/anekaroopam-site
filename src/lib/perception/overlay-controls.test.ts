import assert from "node:assert/strict";
import test from "node:test";

/** Mirrors PerceptionMetadata stopPropagation contract for unit coverage. */
export function shouldStopPropagationForOverlayControl(
  targetRole: "toggle" | "advanced" | "canvas",
): boolean {
  return targetRole === "toggle" || targetRole === "advanced";
}

test("overlay and archival controls stop rotation propagation", () => {
  assert.equal(shouldStopPropagationForOverlayControl("toggle"), true);
  assert.equal(shouldStopPropagationForOverlayControl("advanced"), true);
  assert.equal(shouldStopPropagationForOverlayControl("canvas"), false);
});
