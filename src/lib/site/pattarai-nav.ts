/** Pattarai workspace entry — tools, not a content section. */
export const PATTARAI_HREF = "/perceive" as const;

export const PATTARAI_LABEL = "Pattarai" as const;

/** Tamil progressive enhancement revealed on hover/focus (desktop). */
export const PATTARAI_TAMIL = "பட்டறை" as const;

/** Mobile / no-hover visible label. */
export const PATTARAI_MOBILE_LABEL = `${PATTARAI_LABEL} · ${PATTARAI_TAMIL}` as const;

/** Accessible name: English + Tamil once, plus workspace purpose. */
export const PATTARAI_ARIA_LABEL =
  "Pattarai (பட்டறை) — Perception tools · Artwork preparation" as const;

export const PATTARAI_TITLE = `${PATTARAI_TAMIL} — Perception tools · Artwork preparation` as const;

export function isPattaraiPath(pathname: string): boolean {
  return (
    pathname === PATTARAI_HREF || pathname.startsWith(`${PATTARAI_HREF}/`)
  );
}
