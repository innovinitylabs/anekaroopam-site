/**
 * Shared Perception engine constants.
 * React adapters and the standalone HTML emitter MUST import these —
 * do not hardcode duplicates in viewers or build-html IIFEs.
 */

export const PERCEPTION_IDLE_MS = 3200;
export const PERCEPTION_INTERPOLATE_MS = 680;
export const PERCEPTION_ROTATION_STEP_DEG = 22.5;
export const PERCEPTION_MIN_ZOOM = 0.4;
export const PERCEPTION_MAX_ZOOM = 4;
export const PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG = 8;
export const PERCEPTION_WHEEL_ZOOM_DELTA = 0.08;
export const PERCEPTION_KEYBOARD_ZOOM_DELTA = 0.1;
export const PERCEPTION_DRAG_THRESHOLD_PX = 2;
/** Viewport padding around the artwork (CSS percent of stage). */
export const PERCEPTION_VIEWPORT_PADDING_PCT = 4;
/** CSS object-fit for the artwork image. */
export const PERCEPTION_OBJECT_FIT = "contain" as const;

/** Markers asserted by regression tests for standalone runtime health. */
export const STANDALONE_RUNTIME_MARKERS = [
  "var idleTimer = null",
  "var DURATION = CONFIG.interpolateMs",
  "passive: false",
  "activeStateThreshold",
] as const;

export const PERCEPTION_WHEEL_LISTENER_OPTIONS: AddEventListenerOptions = {
  passive: false,
};
