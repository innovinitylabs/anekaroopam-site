/** Shared site header scroll surface — keep in sync with SiteNav. */

export const SITE_NAV_SCROLL_THRESHOLD_PX = 32;

/** True when the fixed header should use the paper-toned scrolled surface. */
export function isSiteNavScrolled(scrollY: number): boolean {
  return Number.isFinite(scrollY) && scrollY > SITE_NAV_SCROLL_THRESHOLD_PX;
}
