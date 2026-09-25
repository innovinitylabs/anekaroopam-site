# Pattarai and Perception

## Names

- **Pattarai** (`பட்டறை`): the artwork preparation workspace at `/perceive` (Orient + Prepare). Site navigation label; tools are made and used here — not a content section like Archive.
- **Perception**: the orientation / multistable viewing **engine** (rotation, zoom, overlays, idle UI) shared by the public archive viewer, Pattarai preview, ingestion wizard, and standalone HTML packages.

Internal module names (`PerceptionCanvas`, `engine.ts`, etc.) stay Perception-oriented.

## Shared engine (required)

One implementation under `src/lib/perception/`:

| Module | Role |
| --- | --- |
| `constants.ts` | Idle, interpolate, zoom, thresholds, fit |
| `engine.ts` | Math + input helpers (React adapters) |
| `emit-standalone-runtime.ts` | Emits self-contained JS using the same constants |
| `html-export/build-html.ts` | Markup/CSS/CONFIG only; injects emitted runtime |

React (`PerceptionCanvas`) and standalone `perception.html` must not maintain separate numeric behavior.

## Intentional divergences (not separate engines)

1. **Delivery assets:** Public `/archive/[slug]` may use preview WebP/AVIF for performance. Packages embed archival `artwork.avif` (and WebP only on **compatible** profile when requested). Interaction model is shared; byte weight may differ.
2. **Motion chrome:** Site may use Framer springs; standalone uses CSS transform + rAF. Same angles/zoom/idle/overlay rules.
3. **Snap UI:** Editor / standalone checkbox + optional localStorage; public runtime uses published `snapToState` only.
4. **Site chrome:** Archive back link / provenance live outside the canvas.

## Export profiles

| Profile | Images | Notes |
| --- | --- | --- |
| `onchain` | Single embedded AVIF, minified | No WebP, no external URLs, size-report |
| `compatible` | AVIF + optional WebP | WebP only when fallback is requested — never silent unused dual high-res embeds |

## Archival package checklist (manual)

Open generated `perception.html` via `file://` with network disabled (Chromium + Safari):

- [ ] Rotation (click halves / arrows / mobile buttons)
- [ ] Zoom (wheel / +/-)
- [ ] Overlay toggle and archival record (controls must not rotate)
- [ ] No console errors
- [ ] DevTools Network: no requests
- [ ] Images are `data:` embeds

Automated coverage: `src/lib/perception/archival-standalone.test.ts`, `engine-parity.test.ts`, html-export profile tests.

## Out of scope for Pattarai work

Do not change D1 lifecycle, frozen revisions, R2 ownership, archive fallback precedence, or legacy placeholder policy when changing Pattarai UI or the shared engine.
