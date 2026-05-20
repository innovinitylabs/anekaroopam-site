import type { PerceptualState } from "./types";

/** Returns true if the artwork title should be shown in overlays. */
export function hasDisplayTitle(title?: string): boolean {
  const t = title?.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower === "untitled orientation" || lower === "untitled") return false;
  return true;
}

export function displayTitle(title?: string): string {
  return hasDisplayTitle(title) ? title!.trim() : "";
}

/** State label for overlays: name if set, otherwise angle only. */
export function stateDisplayLabel(state: PerceptualState): string {
  const name = state.name?.trim();
  if (name) return name;
  return `${Math.round(state.angle)}°`;
}

export function hasStateName(state: PerceptualState): boolean {
  return Boolean(state.name?.trim());
}

export function stateOverlayLines(state: PerceptualState | null): {
  primary: string;
  secondary: string;
} {
  if (!state) return { primary: "", secondary: "" };
  const name = state.name?.trim();
  if (name) {
    return {
      primary: name,
      secondary: state.caption?.trim() ?? "",
    };
  }
  return {
    primary: `${Math.round(state.angle)}°`,
    secondary: state.caption?.trim() ?? "",
  };
}
