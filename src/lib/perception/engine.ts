import type { PerceptualState, ViewTransform } from "./types";
import {
  DEFAULT_ENGINE_OPTIONS,
  type PerceptionEngineOptions,
} from "./types";
import {
  PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  PERCEPTION_DRAG_THRESHOLD_PX,
  PERCEPTION_KEYBOARD_ZOOM_DELTA,
  PERCEPTION_WHEEL_ZOOM_DELTA,
} from "./constants";

export {
  PERCEPTION_WHEEL_LISTENER_OPTIONS,
  PERCEPTION_IDLE_MS,
  PERCEPTION_INTERPOLATE_MS,
  PERCEPTION_ROTATION_STEP_DEG,
  PERCEPTION_MIN_ZOOM,
  PERCEPTION_MAX_ZOOM,
  PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  PERCEPTION_WHEEL_ZOOM_DELTA,
  PERCEPTION_KEYBOARD_ZOOM_DELTA,
  PERCEPTION_DRAG_THRESHOLD_PX,
  PERCEPTION_VIEWPORT_PADDING_PCT,
  PERCEPTION_OBJECT_FIT,
  STANDALONE_RUNTIME_MARKERS,
} from "./constants";

export function normalizeAngle(angle: number): number {
  const mod = angle % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function shortestAngleDelta(from: number, to: number): number {
  const a = normalizeAngle(from);
  const b = normalizeAngle(to);
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeAngle(from + shortestAngleDelta(from, to) * t);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function findNearestState(
  angle: number,
  states: PerceptualState[],
): PerceptualState | null {
  if (states.length === 0) return null;
  let nearest = states[0];
  let minDist = Math.abs(shortestAngleDelta(angle, nearest.angle));
  for (const state of states.slice(1)) {
    const dist = Math.abs(shortestAngleDelta(angle, state.angle));
    if (dist < minDist) {
      minDist = dist;
      nearest = state;
    }
  }
  return nearest;
}

export function getActiveState(
  angle: number,
  states: PerceptualState[],
  threshold = PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
): PerceptualState | null {
  const nearest = findNearestState(angle, states);
  if (!nearest) return null;
  const dist = Math.abs(shortestAngleDelta(angle, nearest.angle));
  return dist <= threshold ? nearest : null;
}

export function getStateIndex(states: PerceptualState[], id: string): number {
  return states.findIndex((s) => s.id === id);
}

export function nextState(
  states: PerceptualState[],
  currentAngle: number,
  direction: "cw" | "ccw",
): PerceptualState | null {
  if (states.length === 0) return null;
  const sorted = [...states].sort((a, b) => a.angle - b.angle);
  const active = findNearestState(currentAngle, sorted);
  const idx = active ? sorted.findIndex((s) => s.id === active.id) : 0;
  const nextIdx =
    direction === "cw"
      ? (idx + 1) % sorted.length
      : (idx - 1 + sorted.length) % sorted.length;
  return sorted[nextIdx];
}

export function createId(): string {
  return `ps_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultTransform(initialAngle = 0): ViewTransform {
  return { angle: initialAngle, zoom: 1, panX: 0, panY: 0 };
}

export function clampZoom(
  zoom: number,
  options: PerceptionEngineOptions = {},
): number {
  const { minZoom, maxZoom } = { ...DEFAULT_ENGINE_OPTIONS, ...options };
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export function rotateByDirection(
  transform: ViewTransform,
  direction: "cw" | "ccw",
  states: PerceptualState[],
  options: PerceptionEngineOptions = {},
): number {
  const merged = { ...DEFAULT_ENGINE_OPTIONS, ...options };
  if (merged.snapToState && states.length > 0) {
    const target = nextState(states, transform.angle, direction);
    return target ? target.angle : transform.angle;
  }
  const delta = direction === "cw" ? merged.rotationStep : -merged.rotationStep;
  return normalizeAngle(transform.angle + delta);
}

/** Half-click rotation: left half = ccw, right half = cw. */
export function clickRotationDirection(
  clientX: number,
  stageLeft: number,
  stageWidth: number,
): "cw" | "ccw" {
  return clientX - stageLeft < stageWidth / 2 ? "ccw" : "cw";
}

export function wheelZoomDelta(deltaY: number): number {
  return deltaY < 0
    ? PERCEPTION_WHEEL_ZOOM_DELTA
    : -PERCEPTION_WHEEL_ZOOM_DELTA;
}

export function keyboardZoomDelta(key: string): number | null {
  if (key === "+" || key === "=") return PERCEPTION_KEYBOARD_ZOOM_DELTA;
  if (key === "-") return -PERCEPTION_KEYBOARD_ZOOM_DELTA;
  return null;
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return (
    Math.abs(dx) > PERCEPTION_DRAG_THRESHOLD_PX ||
    Math.abs(dy) > PERCEPTION_DRAG_THRESHOLD_PX
  );
}

/**
 * Control elements must not trigger stage rotation.
 * Adapters call stopPropagation on these; tests assert the contract.
 */
export const PERCEPTION_CONTROL_STOP_PROPAGATION = true as const;

export function shouldIgnoreStageClick(options: {
  dragging: boolean;
  suppressClick: boolean;
}): boolean {
  return options.dragging || options.suppressClick;
}
