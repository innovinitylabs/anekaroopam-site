import type { BackgroundPreset } from "./types";

export const BACKGROUND_PRESETS: Record<
  BackgroundPreset,
  { label: string; value: string }
> = {
  black: { label: "Pure black", value: "#0a0a0a" },
  paper: { label: "Warm paper", value: "#f4f0e8" },
  gallery: { label: "Gallery white", value: "#f8f7f5" },
  archival: { label: "Archival mute", value: "#e8e4dc" },
  custom: { label: "Custom", value: "#f4f0e8" },
};

export function resolveBackground(
  background: BackgroundPreset | string,
  customColor?: string,
): string {
  if (background === "custom" && customColor) {
    return customColor;
  }
  if (background in BACKGROUND_PRESETS) {
    return BACKGROUND_PRESETS[background as BackgroundPreset].value;
  }
  return background;
}

export function foregroundForBackground(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "#1a1814";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1a1814" : "#e8e4dc";
}
