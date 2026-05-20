export const BRAND = {
  name: "Anekaroopam",
  latinInitial: "A",
  tamilInitial: "\u0B85",
  favicon: "/favicon.ico",
  ico: "/valipokkann.ico",
  svg: "/valipokkann.svg",
  /** Light / paper backgrounds */
  markLight: "/valipokkann_circle_logo.png",
  /** Dark backgrounds */
  markDark: "/valipokkann_transparent_logo.png",
  /** Continuous motion; use on dark or hero */
  markAnimated: "/valipokkann_480x.gif",
} as const;

export type BrandTheme = "light" | "dark";

export function brandMarkSrc(
  theme: BrandTheme,
  options?: { animated?: boolean },
): string {
  if (options?.animated) return BRAND.markAnimated;
  return theme === "dark" ? BRAND.markDark : BRAND.markLight;
}
