// main.js — wires Sunset Cover Studio: photo registry, controls, live preview
// with click-to-select / drag-to-pan / scroll-to-zoom panels, undo-redo, and
// PNG export in the three post sizes. A `?shot=` query runs a fixed scene for
// screenshots instead (./shots.js).
import { renderCover, layoutPanels, defaultState, GRADES, LAYOUTS } from './cover.js';
import { History, cloneState } from './state.js';
import { runShot, panelAt, SIZES } from './shots.js';

const canvas = document.getElementById('cover');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const $ = (id) => document.getElementById(id);

const history = new History(defaultState());
// A private copy: history.current must never be mutated in place, or undo
// could not tell the edited state from its own baseline.
let state = cloneState(history.current);
let shotMode = false;
let selectedPanel = 0;

/** Photo registry: id -> loaded image (samples + uploads). */
const photos = {};
let uploadCount = 0;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function loadSample(name) {
  const id = `sample-${name}`;
  if (!photos[id]) {
    const img = await loadImage(`samples/${name}.jpg`);
    img.__id = id;
    photos[id] = img;
  }
  return id;
}

function currentSize() {
  return SIZES[$('size').value] ?? SIZES.square;
}

/** Sizes the preview canvas to the chosen aspect (max side 900 px). */
function sizePreviewCanvas() {
  if (shotMode) return;
  const { w, h } = currentSize();
  const scale = 900 / Math.max(w, h);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
}

function redraw() {
  sizePreviewCanvas();
  renderCover(ctx, canvas.width, canvas.height, state, photos);
  drawSelection();
  syncUI();
}

/** Amber dashed outline around the selected panel in the preview. */
function drawSelection() {
  if (shotMode) return;
  const layout = layoutPanels(state.layout, canvas.width, canvas.height);
  const panel = layout.panels[selectedPanel];
  if (!panel) return;
  ctx.save();
  ctx.translate(panel.x + panel.w / 2, panel.y + panel.h / 2);
  if (panel.rot) ctx.rotate((panel.rot * Math.PI) / 180);
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = Math.max(2, canvas.width * 0.003);
  ctx.setLineDash([10, 7]);
  ctx.strokeRect(-panel.w / 2, -panel.h / 2, panel.w, panel.h);
  ctx.restore();
}

function syncUI() {
  document.querySelectorAll('#layouts button').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('#grades button').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
  document.querySelectorAll('#thumbs img').forEach((img) => {
    const id = img.dataset.photo;
    const active = state.fillMode === 'one' ? id === state.fillPhoto : id === (state.panels[selectedPanel] ?? {}).photoId;
    img.classList.toggle('active', active);
  });
  document.querySelectorAll('#heat-stars button').forEach((b, i) => b.classList.toggle('off', i >= state.heat));
  $('strength').value = Math.round(state.gradeStrength * 100);
  $('strength-val').textContent = `${Math.round(state.gradeStrength * 100)}%`;
  const slot = state.panels[selectedPanel] ?? { zoom: 1 };
  $('zoom').value = Math.round(slot.zoom * 100);
  $('zoom-val').textContent = `${Math.round(slot.zoom * 100)}%`;
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
  $('panel-hint').textContent = `Panel ${selectedPanel + 1} of ${layoutPanels(state.layout, canvas.width, canvas.height).panels.length} selected — drag to move the photo, scroll to zoom.`;
}

function commit() {
  if (history.push(state)) syncUI();
}

/** Applies a state change, redraws, and records it for undo. */
function change(mutator) {
  state = JSON.parse(JSON.stringify(state));
  mutator(state);
  history.push(state);
  redraw();
}

// --- Control builders -------------------------------------------------------
const layoutsEl = $('layouts');
for (const [id, def] of Object.entries(LAYOUTS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.layout = id;
  b.innerHTML = `${def.name}<span class="sub">${def.slots} panel${def.slots > 1 ? 's' : ''}</span>`;
  b.addEventListener('click', () => change((s) => { s.layout = id; }));
  layoutsEl.appendChild(b);
}

const gradesEl = $('grades');
for (const [id, def] of Object.entries(GRADES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.grade = id;
  b.textContent = def.name;
  b.addEventListener('click', () => change((s) => { s.grade = id; }));
  gradesEl.appendChild(b);
}

const heatEl = $('heat-stars');
for (let i = 0; i < 5; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '★';
  b.setAttribute('aria-label', `Heat ${i + 1}`);
  b.addEventListener('click', () => change((s) => { s.heat = i + 1; }));
  heatEl.appendChild(b);
}

// --- Text and toggles ---------------------------------------------------------
function bindText(id, key) {
  const el = $(id);
  el.addEventListener('input', () => { state[key] = el.value; redraw(); });
  el.addEventListener('change', commit);
}
bindText('title', 'title');
bindText('subtitle', 'subtitle');
bindText('badge', 'badge');

$('strength').addEventListener('input', () => {
  state.gradeStrength = $('strength').value / 100;
  redraw();
});
$('strength').addEventListener('change', commit);

$('zoom').addEventListener('input', () => {
  const slot = state.panels[selectedPanel];
  if (slot) { slot.zoom = $('zoom').value / 100; redraw(); }
});
$('zoom').addEventListener('change', commit);

function bindToggle(id, key) {
  $(id).addEventListener('change', () => change((s) => { s[key] = $(id).checked; }));
}
bindToggle('opt-grain', 'grain');
bindToggle('opt-vignette', 'vignette');
bindToggle('opt-ink', 'inkPanels');
bindToggle('opt-halftone', 'halftone');

document.querySelectorAll('input[name="fill"]').forEach((r) => {
  r.addEventListener('change', () => change((s) => { s.fillMode = r.value; }));
});

$('reset-panel').addEventListener('click', () => change((s) => {
  s.panels[selectedPanel] = { photoId: s.panels[selectedPanel]?.photoId ?? s.fillPhoto, zoom: 1, ox: 0, oy: 0 };
}));

// --- Photos -----------------------------------------------------------------
function addThumb(id, src) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = id;
  img.dataset.photo = id;
  img.addEventListener('click', () => {
    change((s) => {
      if (s.fillMode === 'one') {
        s.fillPhoto = id;
        s.panels.forEach((p) => { p.photoId = id; });
      } else {
        s.panels[selectedPanel].photoId = id;
      }
    });
  });
  $('thumbs').appendChild(img);
}

async function registerSample(name) {
  const id = await loadSample(name);
  if (!document.querySelector(`#thumbs img[data-photo="${id}"]`)) addThumb(id, `samples/${name}.jpg`);
  return id;
}

$('sample-pier').addEventListener('click', async () => {
  const id = await registerSample('pier');
  change((s) => { s.fillPhoto = id; s.panels.forEach((p) => { p.photoId = id; }); });
});
$('sample-boulevard').addEventListener('click', async () => {
  const id = await registerSample('boulevard');
  change((s) => { s.fillPhoto = id; s.panels.forEach((p) => { p.photoId = id; }); });
});

$('upload').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const id = `upload-${++uploadCount}`;
    img.__id = id;
    photos[id] = img;
    addThumb(id, url);
    change((s) => { s.fillPhoto = id; s.panels.forEach((p) => { p.photoId = id; }); });
  }
  e.target.value = '';
});

// --- Preview interaction: select, drag to pan, scroll to zoom ---------------
let dragging = false;
let dragStart = null;
let dragMoved = false;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const hit = panelAt(state, canvas.width, canvas.height, p.x, p.y);
  if (hit >= 0) {
    selectedPanel = hit;
    dragging = true;
    dragMoved = false;
    dragStart = p;
    canvas.setPointerCapture(e.pointerId);
    redraw();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = canvasPoint(e);
  const slot = state.panels[selectedPanel];
  if (!slot) return;
  const layout = layoutPanels(state.layout, canvas.width, canvas.height);
  const panel = layout.panels[selectedPanel];
  if (!panel) return;
  slot.ox += (p.x - dragStart.x) / panel.w;
  slot.oy += (p.y - dragStart.y) / panel.h;
  slot.ox = Math.max(-0.6, Math.min(0.6, slot.ox));
  slot.oy = Math.max(-0.6, Math.min(0.6, slot.oy));
  dragStart = p;
  dragMoved = true;
  redraw();
});
canvas.addEventListener('pointerup', () => {
  if (dragging && dragMoved) commit();
  dragging = false;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const slot = state.panels[selectedPanel];
  if (!slot) return;
  slot.zoom = Math.max(1, Math.min(3, slot.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
  redraw();
  clearTimeout(canvas.__zoomTimer);
  canvas.__zoomTimer = setTimeout(commit, 350);
}, { passive: false });

// --- Undo / redo --------------------------------------------------------------
$('undo').addEventListener('click', () => {
  const prev = history.undo();
  if (prev) { state = prev; selectedPanel = 0; redraw(); }
});
$('redo').addEventListener('click', () => {
  const next = history.redo();
  if (next) { state = next; selectedPanel = 0; redraw(); }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) $('redo').click(); else $('undo').click();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    $('redo').click();
  }
});

// --- Export -------------------------------------------------------------------
function exportSize(size, done) {
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  renderCover(off.getContext('2d'), size.w, size.h, state, photos);
  off.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cover-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status.textContent = `Saved cover-${size.w}x${size.h}.png`;
    if (done) done();
  }, 'image/png');
}

$('export').addEventListener('click', () => exportSize(currentSize()));
$('export-all').addEventListener('click', () => {
  const sizes = Object.values(SIZES);
  let i = 0;
  const next = () => {
    if (i >= sizes.length) { status.textContent = 'Saved all 3 sizes.'; return; }
    exportSize(sizes[i++], () => setTimeout(next, 250));
  };
  next();
});

$('size').addEventListener('change', redraw);

// --- Boot -----------------------------------------------------------------------
const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), async (scene) => {
    const id = await loadSample(scene.photo);
    state.fillPhoto = id;
    state.panels.forEach((p) => { p.photoId = id; });
    if (scene.caption) state.title = scene.caption;
    if (scene.layout) state.layout = scene.layout;
    if (scene.grade) state.grade = scene.grade;
    if (scene.shot === 'cover') {
      shotMode = true;
      canvas.width = scene.size.w;
      canvas.height = scene.size.h;
    }
    try {
      await Promise.all([
        document.fonts.load('100px Anton'),
        document.fonts.load('40px Pacifico'),
        document.fonts.load('40px "Bebas Neue"'),
      ]);
      await document.fonts.ready;
    } catch { /* fall back to system fonts */ }
    redraw();
  });
} else {
  (async () => {
    await registerSample('pier');
    await registerSample('boulevard');
    try {
      await Promise.all([
        document.fonts.load('100px Anton'),
        document.fonts.load('40px Pacifico'),
        document.fonts.load('40px "Bebas Neue"'),
      ]);
      await document.fonts.ready;
    } catch { /* fall back to system fonts */ }
    redraw();
  })();
}
