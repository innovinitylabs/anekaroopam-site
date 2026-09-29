import type { ExportPayload } from "@/lib/perception/types";
import { DEFAULT_ENGINE_OPTIONS } from "@/lib/perception/types";
import { resolveBackground } from "@/lib/perception/backgrounds";
import {
  advancedMetadataEntries,
  primaryOverlayDetails,
} from "@/lib/perception/metadata";
import {
  PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  PERCEPTION_OBJECT_FIT,
  PERCEPTION_VIEWPORT_PADDING_PCT,
  STANDALONE_RUNTIME_MARKERS,
} from "@/lib/perception/constants";
import { emitStandaloneRuntimeScript } from "@/lib/perception/emit-standalone-runtime";
import { mimeForFormat } from "@/lib/image-processing/format-support";
import type { EmbeddedImageAsset, StandaloneArchiveMeta } from "./types";
import { minifyStandaloneHtml } from "./minify-standalone";
import type { StandaloneExportProfile } from "./standalone-profile";

export { STANDALONE_RUNTIME_MARKERS };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPictureMarkup(
  primary: EmbeddedImageAsset,
  fallbacks: EmbeddedImageAsset[] = [],
): string {
  const sources = [...fallbacks, primary]
    .filter(
      (asset, index, arr) =>
        arr.findIndex((a) => a.format === asset.format) === index,
    )
    .sort((a, b) => {
      const order: Record<string, number> = { webp: 0, avif: 1, png: 2, jpeg: 3 };
      return order[a.format] - order[b.format];
    })
    .map(
      (asset) =>
        `<source srcset="${asset.dataUrl}" type="${mimeForFormat(asset.format, false)}" />`,
    )
    .join("");

  const fallback =
    [...fallbacks, primary].find((a) => a.format === "jpeg") ??
    [...fallbacks, primary].find((a) => a.format === "webp") ??
    primary;

  return `<picture>${sources}<img id="artwork" alt="" src="${fallback.dataUrl}" /></picture>`;
}

export interface BuildHtmlInput {
  payload: ExportPayload;
  embedded?: EmbeddedImageAsset;
  fallbacks?: EmbeddedImageAsset[];
  archiveMeta?: StandaloneArchiveMeta;
  /** Default compatible. onchain = single AVIF, minified, no WebP. */
  profile?: StandaloneExportProfile;
  /** Force minify independently of profile (onchain always minifies). */
  minify?: boolean;
}

export function buildStandaloneHtml(
  input: BuildHtmlInput | ExportPayload,
): string {
  const isLegacy = "artwork" in input && !("payload" in input);
  const payload: ExportPayload = isLegacy
    ? (input as ExportPayload)
    : (input as BuildHtmlInput).payload;
  const embedded = isLegacy
    ? undefined
    : (input as BuildHtmlInput).embedded;
  const fallbacks = isLegacy ? [] : ((input as BuildHtmlInput).fallbacks ?? []);
  const archiveMeta = isLegacy ? undefined : (input as BuildHtmlInput).archiveMeta;
  const profile: StandaloneExportProfile = isLegacy
    ? "compatible"
    : ((input as BuildHtmlInput).profile ?? "compatible");
  const shouldMinify =
    profile === "onchain" ||
    (!isLegacy && (input as BuildHtmlInput).minify === true);

  const effectiveFallbacks =
    profile === "onchain" ? [] : fallbacks.filter((f) => f.format === "webp");

  const { artwork } = payload;
  const bg = resolveBackground(artwork.background);
  const overlayFields = artwork.overlayFields ?? {
    title: true,
    year: true,
    process: true,
    state: true,
    caption: true,
    advanced: true,
  };

  // When the image is embedded in markup, omit data URL from CONFIG to avoid
  // doubling base64 payload size (critical for on-chain).
  const imageInMarkup = Boolean(embedded);
  const configImageSrc = imageInMarkup
    ? ""
    : (embedded?.dataUrl ?? artwork.imageSrc);

  const configJson = JSON.stringify({
    imageSrc: configImageSrc,
    states: artwork.states,
    metadata: artwork.metadata,
    background: bg,
    initialAngle: artwork.initialAngle ?? 0,
    initialSnapToState: artwork.snapToState ?? false,
    artworkId: artwork.id || "artwork",
    showMetadata: artwork.showMetadataOverlay ?? true,
    overlayFields,
    primaryDetails: primaryOverlayDetails(artwork.metadata, overlayFields),
    advancedMetadata: advancedMetadataEntries(artwork.metadata),
    embedFormat: embedded?.format ?? null,
    profile,
    displayAsset: embedded
      ? {
          format: embedded.format,
          embedded: true,
          source: profile === "onchain" ? "artwork.avif" : "artwork+optional-webp",
        }
      : { format: null, embedded: false, source: "config.imageSrc" },
    standaloneRuntimeVersion:
      profile === "onchain"
        ? "standalone-onchain-v1"
        : (archiveMeta?.standaloneVersion ?? "standalone-runtime-v1"),
    interpolateMs: DEFAULT_ENGINE_OPTIONS.interpolateMs,
    rotationStep: DEFAULT_ENGINE_OPTIONS.rotationStep,
    minZoom: DEFAULT_ENGINE_OPTIONS.minZoom,
    maxZoom: DEFAULT_ENGINE_OPTIONS.maxZoom,
    activeStateThreshold: PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  });
  const archiveMetaJson =
    profile === "onchain"
      ? JSON.stringify({
          standaloneVersion: "standalone-onchain-v1",
          profile: "onchain",
        })
      : JSON.stringify({
          standaloneVersion:
            archiveMeta?.standaloneVersion ?? "standalone-runtime-v1",
          profile: "compatible",
          manifest: archiveMeta?.manifest ?? null,
          runtime: archiveMeta?.runtime ?? null,
        });

  const title = escapeHtml(artwork.metadata.title);
  let artworkMarkup: string;
  if (embedded && profile === "onchain") {
    artworkMarkup = `<img id="artwork" alt="" src="${embedded.dataUrl}" />`;
  } else if (
    embedded &&
    (effectiveFallbacks.length > 0 || embedded.format !== "png")
  ) {
    artworkMarkup = buildPictureMarkup(embedded, effectiveFallbacks);
  } else if (embedded) {
    artworkMarkup = `<img id="artwork" alt="" src="${embedded.dataUrl}" />`;
  } else {
    artworkMarkup = `<img id="artwork" alt="" />`;
  }

  const pad = PERCEPTION_VIEWPORT_PADDING_PCT;
  const objectFit = PERCEPTION_OBJECT_FIT;
  const runtimeScript = emitStandaloneRuntimeScript(configJson, archiveMetaJson);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title} — Anekaroopam</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: ${bg}; font-family: Georgia, serif; }
  #stage { position: fixed; inset: 0; cursor: crosshair; touch-action: none; }
  #viewport { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: ${pad}%; }
  #transform { will-change: transform; transform-origin: center center; max-width: 100%; max-height: 100%; display: flex; align-items: center; justify-content: center; }
  #artwork, picture img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: ${objectFit}; display: block; user-select: none; pointer-events: none; }
  picture { display: block; line-height: 0; max-width: 100%; max-height: 100%; }
  #meta { position: fixed; left: 0; right: 0; bottom: 0; padding: 2rem 2.5rem calc(env(safe-area-inset-bottom) + 2.25rem); color: rgba(26,24,20,0.72); transition: opacity 0.5s; pointer-events: none; max-height: 55vh; overflow-y: auto; }
  #meta.dark { color: rgba(232,228,220,0.72); }
  #meta.hidden { opacity: 0; }
  #meta.interactive { pointer-events: auto; }
  #meta h1 { font-size: 0.72rem; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 400; }
  #meta h1.tamil-title { font-family: Georgia, serif; font-weight: 300; letter-spacing: 0.08em; text-transform: none; font-size: 0.95rem; }
  #meta .state { margin-top: 0.65rem; font-size: 0.95rem; letter-spacing: 0.06em; }
  #meta .caption { margin-top: 0.35rem; font-size: 0.82rem; font-style: italic; opacity: 0.85; max-width: 36rem; line-height: 1.55; }
  #meta .detail { margin-top: 0.5rem; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.55; }
  #meta-adv-toggle { margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem; width: 100%; max-width: 20rem; background: none; border: none; color: inherit; font: inherit; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.42; cursor: pointer; padding: 0; }
  #meta-adv-toggle:hover { opacity: 0.62; }
  #meta-adv-toggle .rule { flex: 1; height: 1px; background: currentColor; opacity: 0.25; }
  #meta-adv-toggle .chev { font-size: 0.55rem; transition: transform 0.3s; }
  #meta-adv-toggle.open .chev { transform: rotate(180deg); }
  #meta-adv { display: none; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(26,24,20,0.12); max-width: 36rem; }
  #meta.dark #meta-adv { border-top-color: rgba(232,228,220,0.12); }
  #meta-adv.open { display: block; }
  #meta-adv dl { font-size: 0.72rem; line-height: 1.55; opacity: 0.62; }
  #meta-adv dt { font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.75; margin-top: 0.65rem; }
  #meta-adv dt:first-child { margin-top: 0; }
  #meta-adv dd { margin-top: 0.2rem; white-space: pre-wrap; }
  #controls { position: fixed; top: calc(env(safe-area-inset-top) + 1.25rem); right: 1.5rem; opacity: 0; transition: opacity 0.45s; pointer-events: none; font-size: 0.62rem; letter-spacing: 0.14em; color: rgba(26,24,20,0.5); }
  #controls.dark { color: rgba(232,228,220,0.5); }
  #controls.visible { opacity: 1; pointer-events: auto; }
  #controls label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; user-select: none; }
  #controls #overlay-toggle { display: block; margin-top: 0.55rem; border: 1px solid currentColor; background: transparent; color: inherit; font: inherit; font-size: 0.56rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.35rem 0.5rem; cursor: pointer; opacity: 0.75; }
  #controls #overlay-toggle:hover { opacity: 1; }
  #controls input[type="checkbox"] { width: 0.75rem; height: 0.75rem; margin: 0; accent-color: rgba(26,24,20,0.45); cursor: pointer; }
  #controls.dark input[type="checkbox"] { accent-color: rgba(232,228,220,0.45); }
  #mobile-rotate { display: none; }
  #hint { position: fixed; top: calc(env(safe-area-inset-top) + 1.25rem); left: 50%; transform: translateX(-50%); font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0; transition: opacity 0.4s; pointer-events: none; }
  #hint.visible { opacity: 0.35; }
  @media (max-width: 640px) {
    #viewport { padding: 3%; }
    #controls { top: calc(env(safe-area-inset-top) + 0.9rem); right: 1rem; max-width: 44vw; font-size: 0.56rem; line-height: 1.45; }
    #meta { padding: 1.25rem 1.25rem calc(env(safe-area-inset-bottom) + 4.75rem); max-height: 48vh; }
    #meta h1 { font-size: 0.66rem; letter-spacing: 0.2em; }
    #hint { top: calc(env(safe-area-inset-top) + 1rem); font-size: 0.56rem; letter-spacing: 0.16em; white-space: nowrap; }
    #mobile-rotate { position: fixed; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + 0.75rem); display: flex; justify-content: center; gap: 2rem; padding: 0 1.25rem; opacity: 0; transition: opacity 0.4s; pointer-events: none; color: rgba(26,24,20,0.55); }
    #mobile-rotate.dark { color: rgba(232,228,220,0.55); }
    #mobile-rotate.visible { opacity: 1; pointer-events: auto; }
    #mobile-rotate button { min-width: 2.75rem; min-height: 2.75rem; border: 0; border-top: 1px solid currentColor; background: transparent; color: inherit; font: inherit; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.82; }
  }
</style>
</head>
<body>
<div id="stage">
  <div id="viewport">
    <div id="transform">
      ${artworkMarkup}
    </div>
  </div>
  <div id="controls">
    <label>
      <input type="checkbox" id="snap-toggle" />
      <span>Snap to perceptual states</span>
    </label>
    <button type="button" id="overlay-toggle" title="Hide or show archival overlays" aria-label="Toggle archival overlays">Artwork only</button>
  </div>
  <div id="mobile-rotate">
    <button type="button" data-rotate="ccw" aria-label="Rotate counterclockwise">Ccw</button>
    <button type="button" data-reset aria-label="Reset view">0</button>
    <button type="button" data-rotate="cw" aria-label="Rotate clockwise">Cw</button>
  </div>
  <div id="meta">
    <div id="meta-content">
    <h1></h1>
    <div class="state"></div>
    <div class="caption"></div>
    <div class="detail"></div>
    <div id="meta-adv-wrap" style="display:none">
      <button type="button" id="meta-adv-toggle">
        <span class="rule"></span>
        <span class="chev">⌄</span>
        <span>Archival record</span>
        <span class="rule"></span>
      </button>
      <div id="meta-adv"><dl></dl></div>
    </div>
    </div>
  </div>
  <div id="hint">Orientation is emergent</div>
</div>
<script>
${runtimeScript}
</script>
</body>
</html>`;

  return shouldMinify ? minifyStandaloneHtml(html) : html;
}
