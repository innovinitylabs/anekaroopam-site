import type { ExportPayload } from "@/lib/perception/types";
import { resolveBackground } from "@/lib/perception/backgrounds";
import {
  advancedMetadataEntries,
  primaryOverlayDetails,
} from "@/lib/perception/metadata";
import { mimeForFormat } from "@/lib/image-processing/format-support";
import type { EmbeddedImageAsset, StandaloneArchiveMeta } from "./types";

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
    .join("\n      ");

  const fallback =
    [...fallbacks, primary].find((a) => a.format === "jpeg") ??
    [...fallbacks, primary].find((a) => a.format === "webp") ??
    primary;

  return `<picture>
      ${sources}
      <img id="artwork" alt="" src="${fallback.dataUrl}" />
    </picture>`;
}

export interface BuildHtmlInput {
  payload: ExportPayload;
  embedded?: EmbeddedImageAsset;
  fallbacks?: EmbeddedImageAsset[];
  archiveMeta?: StandaloneArchiveMeta;
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

  const { artwork } = payload;
  const imageSrc = embedded?.dataUrl ?? artwork.imageSrc;
  const bg = resolveBackground(artwork.background);
  const overlayFields = artwork.overlayFields ?? {
    title: true,
    year: true,
    process: true,
    state: true,
    caption: true,
    advanced: true,
  };

  const configJson = JSON.stringify({
    imageSrc,
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
    standaloneRuntimeVersion: archiveMeta?.standaloneVersion ?? "standalone-runtime-v1",
  });
  const archiveMetaJson = JSON.stringify({
    standaloneVersion: archiveMeta?.standaloneVersion ?? "standalone-runtime-v1",
    manifest: archiveMeta?.manifest ?? null,
    runtime: archiveMeta?.runtime ?? null,
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
  #controls input[type="checkbox"] { width: 0.75rem; height: 0.75rem; margin: 0; accent-color: rgba(26,24,20,0.45); cursor: pointer; }
  #controls.dark input[type="checkbox"] { accent-color: rgba(232,228,220,0.45); }
  #mobile-rotate { display: none; }
  #hint { position: fixed; top: calc(env(safe-area-inset-top) + 1.25rem); left: 50%; transform: translateX(-50%); font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0; transition: opacity 0.4s; pointer-events: none; }
  #hint.visible { opacity: 0.35; }
  @media (max-width: 640px) {
    #artwork, picture img { max-width: 86vmin; max-height: 82vmin; }
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
  </div>
  <div id="mobile-rotate">
    <button type="button" data-rotate="ccw" aria-label="Rotate counterclockwise">Ccw</button>
    <button type="button" data-reset aria-label="Reset view">0</button>
    <button type="button" data-rotate="cw" aria-label="Rotate clockwise">Cw</button>
  </div>
  <div id="meta">
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
  <div id="hint">Orientation is emergent</div>
</div>
<script>
(function(){
  var CONFIG = ${configJson};
  var ARCHIVE_META = ${archiveMetaJson};
  window.__ANEKAROOPAM_ARCHIVE__ = ARCHIVE_META;
  var stage = document.getElementById('stage');
  var transformEl = document.getElementById('transform');
  var img = document.getElementById('artwork');
  var meta = document.getElementById('meta');
  var controls = document.getElementById('controls');
  var mobileRotate = document.getElementById('mobile-rotate');
  var snapToggle = document.getElementById('snap-toggle');
  var hint = document.getElementById('hint');
  var metaAdvWrap = document.getElementById('meta-adv-wrap');
  var metaAdvToggle = document.getElementById('meta-adv-toggle');
  var metaAdv = document.getElementById('meta-adv');
  var metaAdvList = metaAdv.querySelector('dl');
  var angle = CONFIG.initialAngle || 0;
  var zoom = 1, panX = 0, panY = 0, targetAngle = angle, animStart = null, animFrom = angle;
  var DURATION = 680, idleTimer = null, metaAdvOpen = false;
  var pointers = {};
  var pinchStart = null;
  var suppressClick = false;
  var SNAP_KEY = 'anek_snap_' + (CONFIG.artworkId || 'artwork');
  var snapToState = !!CONFIG.initialSnapToState;
  try {
    var stored = localStorage.getItem(SNAP_KEY);
    if (stored === '1') snapToState = true;
    if (stored === '0') snapToState = false;
  } catch (e) {}
  document.body.style.background = CONFIG.background;
  var hex = CONFIG.background.replace('#','');
  if (hex.length === 6) {
    var r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    if ((0.299*r + 0.587*g + 0.114*b) / 255 < 0.45) {
      meta.classList.add('dark');
      controls.classList.add('dark');
      mobileRotate.classList.add('dark');
    }
  }
  if (!img.getAttribute('src')) img.src = CONFIG.imageSrc;
  img.alt = CONFIG.metadata.title || 'Artwork';
  snapToggle.checked = snapToState;
  function persistSnap() {
    try { localStorage.setItem(SNAP_KEY, snapToState ? '1' : '0'); } catch (e) {}
  }
  function renderAdvancedMeta() {
    if (!CONFIG.advancedMetadata || !CONFIG.advancedMetadata.length) {
      metaAdvWrap.style.display = 'none';
      return;
    }
    if (CONFIG.overlayFields.advanced === false) {
      metaAdvWrap.style.display = 'none';
      return;
    }
    metaAdvWrap.style.display = 'block';
    metaAdvList.innerHTML = CONFIG.advancedMetadata.map(function(entry) {
      return '<dt>' + entry.label + '</dt><dd>' + entry.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</dd>';
    }).join('');
  }
  renderAdvancedMeta();
  metaAdvToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    metaAdvOpen = !metaAdvOpen;
    metaAdvToggle.classList.toggle('open', metaAdvOpen);
    metaAdv.classList.toggle('open', metaAdvOpen);
    meta.classList.add('interactive');
    pulseUi();
  });
  controls.addEventListener('click', function(e) { e.stopPropagation(); });
  mobileRotate.addEventListener('click', function(e) {
    e.stopPropagation();
    var button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.rotate) rotate(button.dataset.rotate);
    if (button.dataset.reset !== undefined) resetView();
  });
  snapToggle.addEventListener('change', function(e) {
    e.stopPropagation();
    snapToState = snapToggle.checked;
    persistSnap();
    pulseUi();
  });
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
    meta.querySelector('.detail').textContent = CONFIG.primaryDetails ? CONFIG.primaryDetails.join(' · ') : '';
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
    if (snapToState && CONFIG.states.length) {
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
    controls.classList.add('visible');
    mobileRotate.classList.add('visible');
    hint.classList.add('visible');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() {
      if (!metaAdvOpen) meta.classList.remove('interactive');
      meta.classList.add('hidden');
      controls.classList.remove('visible');
      mobileRotate.classList.remove('visible');
      hint.classList.remove('visible');
    }, 3200);
  }
  stage.addEventListener('click', function(e) {
    if (dragging || suppressClick) {
      suppressClick = false;
      return;
    }
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
  function pointerDistance() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return 0;
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  stage.addEventListener('pointerdown', function(e) {
    if (e.detail > 1) return;
    dragging = false;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (Object.keys(pointers).length === 2) {
      pinchStart = { distance: pointerDistance(), zoom: zoom };
      suppressClick = true;
    }
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', function(e) {
    if (!stage.hasPointerCapture(e.pointerId)) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinchStart && Object.keys(pointers).length >= 2) {
      var distance = pointerDistance();
      if (pinchStart.distance > 0) {
        zoom = Math.min(4, Math.max(0.4, pinchStart.zoom * (distance / pinchStart.distance)));
        applyTransform();
        pulseUi();
      }
      suppressClick = true;
      return;
    }
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      dragging = true;
      suppressClick = true;
    }
    if (!dragging) return;
    panX += dx;
    panY += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
    pulseUi();
  });
  function endPointer(e) {
    if (stage.hasPointerCapture(e.pointerId)) {
      try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinchStart = null;
    setTimeout(function() { dragging = false; }, 0);
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
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
</html>`;
}
