import type { ExportPayload } from "@/lib/perception/types";
import { resolveBackground } from "@/lib/perception/backgrounds";
import { mimeForFormat } from "@/lib/image-processing/format-support";
import type { EmbeddedImageAsset } from "./types";

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
      const order: Record<string, number> = { avif: 0, webp: 1, png: 2, jpeg: 3 };
      return order[a.format] - order[b.format];
    })
    .map(
      (asset) =>
        `<source srcset="${asset.dataUrl}" type="${mimeForFormat(asset.format, false)}" />`,
    )
    .join("\n      ");

  const fallback =
    [...fallbacks, primary].find((a) => a.format === "png") ?? primary;

  return `<picture>
      ${sources}
      <img id="artwork" alt="" src="${fallback.dataUrl}" />
    </picture>`;
}

export interface BuildHtmlInput {
  payload: ExportPayload;
  embedded?: EmbeddedImageAsset;
  fallbacks?: EmbeddedImageAsset[];
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

  const { artwork } = payload;
  const imageSrc = embedded?.dataUrl ?? artwork.imageSrc;
  const bg = resolveBackground(artwork.background);

  const configJson = JSON.stringify({
    imageSrc,
    states: artwork.states,
    metadata: artwork.metadata,
    background: bg,
    initialAngle: artwork.initialAngle ?? 0,
    snapToState: artwork.snapToState ?? false,
    showMetadata: artwork.showMetadataOverlay ?? true,
    overlayFields: artwork.overlayFields ?? {
      title: true,
      year: true,
      process: true,
      state: true,
      caption: true,
    },
    embedFormat: embedded?.format ?? null,
  });

  const title = escapeHtml(artwork.metadata.title);
  const usePicture = embedded && (fallbacks.length > 0 || embedded.format !== "png");
  const artworkMarkup = usePicture
    ? buildPictureMarkup(embedded, fallbacks)
    : `<img id="artwork" alt="" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title} — Anekaroopam</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: ${bg}; font-family: Georgia, serif; }
  #stage { position: fixed; inset: 0; cursor: crosshair; touch-action: none; }
  #viewport { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  #transform { will-change: transform; transform-origin: center center; }
  #artwork, picture img { max-width: 88vmin; max-height: 88vmin; display: block; user-select: none; pointer-events: none; }
  picture { display: block; line-height: 0; }
  #meta { position: fixed; left: 0; right: 0; bottom: 0; padding: 2rem 2.5rem; color: rgba(26,24,20,0.72); transition: opacity 0.5s; pointer-events: none; }
  #meta.dark { color: rgba(232,228,220,0.72); }
  #meta.hidden { opacity: 0; }
  @import url('https://fonts.googleapis.com/css2?family=Anek+Tamil:wght@100..800&display=swap');
  #meta h1 { font-size: 0.72rem; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 400; }
  #meta h1.tamil-title { font-family: 'Anek Tamil', sans-serif; font-weight: 300; letter-spacing: 0.08em; text-transform: none; font-size: 0.95rem; }
  #meta .state { margin-top: 0.65rem; font-size: 0.95rem; letter-spacing: 0.06em; }
  #meta .caption { margin-top: 0.35rem; font-size: 0.82rem; font-style: italic; opacity: 0.85; max-width: 36rem; line-height: 1.55; }
  #meta .detail { margin-top: 0.5rem; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.55; }
  #hint { position: fixed; top: 1.25rem; left: 50%; transform: translateX(-50%); font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0; transition: opacity 0.4s; }
  #hint.visible { opacity: 0.35; }
</style>
</head>
<body>
<div id="stage">
  <div id="viewport">
    <div id="transform">
      ${artworkMarkup}
    </div>
  </div>
  <div id="meta">
    <h1></h1>
    <div class="state"></div>
    <div class="caption"></div>
    <div class="detail"></div>
  </div>
  <div id="hint">Orientation is emergent</div>
</div>
<script>
(function(){
  var CONFIG = ${configJson};
  var stage = document.getElementById('stage');
  var transformEl = document.getElementById('transform');
  var img = document.getElementById('artwork');
  var meta = document.getElementById('meta');
  var hint = document.getElementById('hint');
  var angle = CONFIG.initialAngle || 0;
  var zoom = 1, panX = 0, panY = 0, targetAngle = angle, animStart = null, animFrom = angle;
  var DURATION = 680, idleTimer = null;
  document.body.style.background = CONFIG.background;
  var hex = CONFIG.background.replace('#','');
  if (hex.length === 6) {
    var r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    if ((0.299*r + 0.587*g + 0.114*b) / 255 < 0.45) meta.classList.add('dark');
  }
  if (!img.getAttribute('src')) img.src = CONFIG.imageSrc;
  img.alt = CONFIG.metadata.title || 'Artwork';
  function norm(a) { a %= 360; return a < 0 ? a + 360 : a; }
  function delta(from, to) {
    var a = norm(from), b = norm(to), d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }
  function nearestState(a) {
    if (!CONFIG.states.length) return null;
    var best = CONFIG.states[0], min = Math.abs(delta(a, best.angle));
    CONFIG.states.forEach(function(s) {
      var dist = Math.abs(delta(a, s.angle));
      if (dist < min) { min = dist; best = s; }
    });
    return best;
  }
  function nextState(dir) {
    if (!CONFIG.states.length) return null;
    var sorted = CONFIG.states.slice().sort(function(a,b) { return a.angle - b.angle; });
    var active = nearestState(angle);
    var idx = active ? sorted.findIndex(function(s) { return s.id === active.id; }) : 0;
    return sorted[dir === 'cw' ? (idx + 1) % sorted.length : (idx - 1 + sorted.length) % sorted.length];
  }
  function updateMeta() {
    if (!CONFIG.showMetadata) return;
    var active = nearestState(angle);
    var h1 = meta.querySelector('h1');
    var titleText = CONFIG.overlayFields.title !== false ? (CONFIG.metadata.title || '') : '';
    h1.textContent = titleText;
    if (/[\\u0B80-\\u0BFF]/.test(titleText)) h1.classList.add('tamil-title');
    else h1.classList.remove('tamil-title');
    var parts = [];
    if (CONFIG.overlayFields.year !== false && CONFIG.metadata.year) parts.push(String(CONFIG.metadata.year));
    if (CONFIG.overlayFields.process !== false && CONFIG.metadata.process) parts.push(CONFIG.metadata.process);
    meta.querySelector('.detail').textContent = parts.join(' · ');
    meta.querySelector('.state').textContent = CONFIG.overlayFields.state !== false && active ? (active.name && active.name.trim() ? active.name : (Math.round(active.angle) + '°')) : '';
    meta.querySelector('.caption').textContent = CONFIG.overlayFields.caption !== false && active && active.caption ? active.caption : '';
  }
  function applyTransform() {
    transformEl.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    img.style.transform = 'rotate(' + angle + 'deg)';
    updateMeta();
  }
  function animate() {
    if (animStart === null) { applyTransform(); return; }
    var t = Math.min(1, (performance.now() - animStart) / DURATION);
    angle = norm(animFrom + delta(animFrom, targetAngle) * (1 - Math.pow(1 - t, 3)));
    applyTransform();
    if (t < 1) requestAnimationFrame(animate);
    else { angle = targetAngle; animStart = null; applyTransform(); }
  }
  function goTo(newAngle) {
    animFrom = angle; targetAngle = norm(newAngle); animStart = performance.now();
    requestAnimationFrame(animate);
  }
  function rotate(dir) {
    if (CONFIG.snapToState && CONFIG.states.length) {
      var s = nextState(dir);
      if (s) goTo(s.angle);
    } else {
      goTo(angle + (dir === 'cw' ? 22.5 : -22.5));
    }
    pulseUi();
  }
  function resetView() { zoom = 1; panX = 0; panY = 0; goTo(CONFIG.initialAngle || 0); pulseUi(); }
  function pulseUi() {
    meta.classList.remove('hidden');
    hint.classList.add('visible');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() {
      meta.classList.add('hidden');
      hint.classList.remove('visible');
    }, 3200);
  }
  stage.addEventListener('click', function(e) {
    var rect = stage.getBoundingClientRect();
    rotate((e.clientX - rect.left) < rect.width / 2 ? 'ccw' : 'cw');
  });
  stage.addEventListener('dblclick', function(e) { e.preventDefault(); resetView(); });
  stage.addEventListener('wheel', function(e) {
    e.preventDefault();
    zoom = Math.min(4, Math.max(0.4, zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
    applyTransform();
    pulseUi();
  }, { passive: false });
  var dragging = false, lastX = 0, lastY = 0;
  stage.addEventListener('pointerdown', function(e) {
    if (e.detail > 1) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    panX += e.clientX - lastX; panY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyTransform(); pulseUi();
  });
  stage.addEventListener('pointerup', function() { dragging = false; });
  window.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') rotate('ccw');
    if (e.key === 'ArrowRight') rotate('cw');
    if (e.key === '+' || e.key === '=') { zoom = Math.min(4, zoom + 0.1); applyTransform(); pulseUi(); }
    if (e.key === '-') { zoom = Math.max(0.4, zoom - 0.1); applyTransform(); pulseUi(); }
    if (e.key === '0') resetView();
  });
  applyTransform();
  pulseUi();
})();
</script>
</body>
</html>`
}
