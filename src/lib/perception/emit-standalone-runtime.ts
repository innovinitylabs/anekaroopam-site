/**
 * Emits the self-contained Perception runtime script for standalone HTML.
 * Numeric behavior comes from shared constants — not a hand-kept fork of engine.ts.
 */
import {
  PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  PERCEPTION_DRAG_THRESHOLD_PX,
  PERCEPTION_IDLE_MS,
  PERCEPTION_INTERPOLATE_MS,
  PERCEPTION_KEYBOARD_ZOOM_DELTA,
  PERCEPTION_MAX_ZOOM,
  PERCEPTION_MIN_ZOOM,
  PERCEPTION_ROTATION_STEP_DEG,
  PERCEPTION_WHEEL_ZOOM_DELTA,
} from "./constants";

/**
 * Builds the IIFE body. `configJson` and `archiveMetaJson` are already
 * JSON.stringify'd and safe to interpolate as JS literals.
 */
export function emitStandaloneRuntimeScript(
  configJson: string,
  archiveMetaJson: string,
): string {
  const idleMs = PERCEPTION_IDLE_MS;
  const interpolateMs = PERCEPTION_INTERPOLATE_MS;
  const rotationStep = PERCEPTION_ROTATION_STEP_DEG;
  const minZoom = PERCEPTION_MIN_ZOOM;
  const maxZoom = PERCEPTION_MAX_ZOOM;
  const stateThreshold = PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG;
  const wheelDelta = PERCEPTION_WHEEL_ZOOM_DELTA;
  const keyZoom = PERCEPTION_KEYBOARD_ZOOM_DELTA;
  const dragPx = PERCEPTION_DRAG_THRESHOLD_PX;

  return `(function(){
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
  var DURATION = CONFIG.interpolateMs || ${interpolateMs};
  var ROTATION_STEP = CONFIG.rotationStep || ${rotationStep};
  var MIN_ZOOM = CONFIG.minZoom || ${minZoom};
  var MAX_ZOOM = CONFIG.maxZoom || ${maxZoom};
  var STATE_THRESHOLD = CONFIG.activeStateThreshold || ${stateThreshold};
  var idleTimer = null;
  var metaAdvOpen = false;
  var overlaysEnabled = CONFIG.showMetadata !== false;
  var metaContent = document.getElementById('meta-content');
  var overlayToggle = document.getElementById('overlay-toggle');
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
  function syncOverlayToggleUi() {
    if (!overlayToggle) return;
    overlayToggle.textContent = overlaysEnabled ? 'Artwork only' : 'Show overlays';
    overlayToggle.setAttribute('aria-pressed', overlaysEnabled ? 'false' : 'true');
    if (metaContent) metaContent.style.display = overlaysEnabled ? '' : 'none';
  }
  syncOverlayToggleUi();
  if (overlayToggle) {
    overlayToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      overlaysEnabled = !overlaysEnabled;
      syncOverlayToggleUi();
      if (overlaysEnabled) updateMeta();
      pulseUi();
    });
  }
  metaAdvToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    metaAdvOpen = !metaAdvOpen;
    metaAdvToggle.classList.toggle('open', metaAdvOpen);
    metaAdv.classList.toggle('open', metaAdvOpen);
    meta.classList.add('interactive');
    pulseUi();
  });
  metaAdv.addEventListener('click', function(e) { e.stopPropagation(); });
  metaAdvWrap.addEventListener('click', function(e) { e.stopPropagation(); });
  meta.addEventListener('click', function(e) { e.stopPropagation(); });
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
  function activeState(a) {
    var n = nearestState(a);
    if (!n) return null;
    return Math.abs(delta(a, n.angle)) <= STATE_THRESHOLD ? n : null;
  }
  function displayTitle(t) {
    if (!t || !String(t).trim()) return '';
    var lower = String(t).trim().toLowerCase();
    if (lower === 'untitled orientation' || lower === 'untitled') return '';
    return String(t).trim();
  }
  function nextState(dir) {
    if (!CONFIG.states.length) return null;
    var sorted = CONFIG.states.slice().sort(function(a,b) { return a.angle - b.angle; });
    var active = nearestState(angle);
    var idx = active ? sorted.findIndex(function(s) { return s.id === active.id; }) : 0;
    return sorted[dir === 'cw' ? (idx + 1) % sorted.length : (idx - 1 + sorted.length) % sorted.length];
  }
  function updateMeta() {
    if (!CONFIG.showMetadata || !overlaysEnabled) return;
    var active = activeState(angle);
    var h1 = meta.querySelector('h1');
    var titleText = CONFIG.overlayFields.title !== false ? displayTitle(CONFIG.metadata.title) : '';
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
      goTo(angle + (dir === 'cw' ? ROTATION_STEP : -ROTATION_STEP));
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
    }, ${idleMs});
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
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + (e.deltaY < 0 ? ${wheelDelta} : -${wheelDelta})));
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
        zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStart.zoom * (distance / pinchStart.distance)));
        applyTransform();
        pulseUi();
      }
      suppressClick = true;
      return;
    }
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    if (Math.abs(dx) > ${dragPx} || Math.abs(dy) > ${dragPx}) {
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
    if (e.key === '+' || e.key === '=') { zoom = Math.min(MAX_ZOOM, zoom + ${keyZoom}); applyTransform(); pulseUi(); }
    if (e.key === '-') { zoom = Math.max(MIN_ZOOM, zoom - ${keyZoom}); applyTransform(); pulseUi(); }
    if (e.key === '0') resetView();
  });
  applyTransform();
  pulseUi();
})();`;
}

/** Values the emitter embeds — used by parity tests against engine.ts. */
export const STANDALONE_EMITTED_CONSTANTS = {
  idleMs: PERCEPTION_IDLE_MS,
  interpolateMs: PERCEPTION_INTERPOLATE_MS,
  rotationStep: PERCEPTION_ROTATION_STEP_DEG,
  minZoom: PERCEPTION_MIN_ZOOM,
  maxZoom: PERCEPTION_MAX_ZOOM,
  stateThreshold: PERCEPTION_ACTIVE_STATE_THRESHOLD_DEG,
  wheelDelta: PERCEPTION_WHEEL_ZOOM_DELTA,
  keyZoom: PERCEPTION_KEYBOARD_ZOOM_DELTA,
  dragPx: PERCEPTION_DRAG_THRESHOLD_PX,
} as const;
