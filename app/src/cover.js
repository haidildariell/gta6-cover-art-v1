// cover.js — the cover renderer for Sunset Cover Studio.
// Draws GTA-poster-style multi-panel covers on a 2D canvas: eight layouts,
// gradient-map colour grades, sunset-gradient display lettering, halftone title
// blocks, badge ribbons, grain and vignette. Everything here is original art:
// the lettering is Anton / Pacifico / Bebas Neue (SIL OFL, vendored under
// app/fonts/), the photos are the maker's own or the bundled samples, and no
// Rockstar logo, artwork or font is used anywhere.

export const FONT_DISPLAY = 'Anton, sans-serif';
export const FONT_SCRIPT = 'Pacifico, cursive';
export const FONT_LABEL = '"Bebas Neue", sans-serif';

/** Gradient-map colour grades: luminance stops from shadow to highlight. */
export const GRADES = {
  'vice-sunset': {
    name: 'Vice Sunset',
    stops: [[0, '#160a2e'], [0.28, '#7b2d8b'], [0.55, '#ff5e62'], [0.8, '#ffb347'], [1, '#fff3b0']],
  },
  'neon-nights': {
    name: 'Neon Nights',
    stops: [[0, '#020617'], [0.25, '#1e1b4b'], [0.52, '#db2777'], [0.78, '#22d3ee'], [1, '#f0abfc']],
  },
  'palm-gold': {
    name: 'Palm Gold',
    stops: [[0, '#201503'], [0.3, '#7c4a03'], [0.58, '#e08a00'], [0.82, '#ffd166'], [1, '#fff8dc']],
  },
  'teal-dusk': {
    name: 'Teal Dusk',
    stops: [[0, '#03181f'], [0.3, '#0b5563'], [0.58, '#14919b'], [0.82, '#7dd3c8'], [1, '#eafff5']],
  },
  'hot-pink': {
    name: 'Hot Pink',
    stops: [[0, '#1c0418'], [0.28, '#7a0e5e'], [0.55, '#e0218a'], [0.8, '#ff7ab8'], [1, '#ffe3f1']],
  },
  'noir-pop': {
    name: 'Noir Pop',
    stops: [[0, '#000000'], [0.3, '#1f2937'], [0.58, '#6b7280'], [0.8, '#f59e0b'], [1, '#ffffff']],
  },
};

/** Eight panel layouts. Each returns the photo panels, the title zone and
 *  whether the title floats over the photo (full-bleed) or sits in its own band. */
export const LAYOUTS = {
  'hero-three': { name: 'Hero + Three', slots: 4 },
  'full-bleed': { name: 'Full Bleed', slots: 1 },
  'grid-2x2': { name: 'Four Grid', slots: 4 },
  'grid-3x3': { name: 'Nine Grid', slots: 9 },
  'tilted-snapshot': { name: 'Tilted Snapshots', slots: 3 },
  triptych: { name: 'Triptych', slots: 3 },
  strips: { name: 'Film Strips', slots: 5 },
  diagonal: { name: 'Diagonal Split', slots: 2 },
};

/** Accent band colours, one per panel slot. */
export const ACCENTS = ['#ff2e88', '#ffb347', '#22d3ee', '#b537f2', '#7dd3c8', '#ff5e62', '#f0abfc', '#ffd166', '#14919b'];

/** Default cover state (serialisable; photos live in a separate registry). */
export function defaultState() {
  return {
    layout: 'hero-three',
    grade: 'vice-sunset',
    gradeStrength: 0.85,
    title: 'Sunset Heist',
    subtitle: 'one last ride',
    badge: 'Vice City',
    heat: 4,
    grain: true,
    vignette: true,
    inkPanels: true,
    halftone: true,
    fillMode: 'one', // 'one' photo fills every panel, 'each' per-panel photos
    fillPhoto: 'sample-pier',
    panels: Array.from({ length: 9 }, () => ({ photoId: 'sample-pier', zoom: 1, ox: 0, oy: 0 })),
  };
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Builds a 256-entry luminance lookup table for a grade at a given strength. */
function buildLut(gradeId, strength) {
  const grade = GRADES[gradeId] ?? GRADES['vice-sunset'];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = grade.stops[0];
    let b = grade.stops[grade.stops.length - 1];
    for (let s = 0; s < grade.stops.length - 1; s++) {
      if (t >= grade.stops[s][0] && t <= grade.stops[s + 1][0]) { a = grade.stops[s]; b = grade.stops[s + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    const ca = hexRgb(a[1]);
    const cb = hexRgb(b[1]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(ca[c] + (cb[c] - ca[c]) * f);
  }
  return { lut, strength };
}

/** Maps every pixel's luminance through the grade, mixed with the original. */
function applyGrade(ctx, w, h, gradeId, strength) {
  if (strength <= 0) return;
  const { lut } = buildLut(gradeId, strength);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const s = strength;
  const inv = 1 - s;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    const o = lum * 3;
    d[i] = d[i] * inv + lut[o] * s;
    d[i + 1] = d[i + 1] * inv + lut[o + 1] * s;
    d[i + 2] = d[i + 2] * inv + lut[o + 2] * s;
  }
  ctx.putImageData(img, 0, 0);
}

const gradeCache = new Map();
/** Draws a photo cover-fit into a panel-sized canvas and grades it. Cached
 *  so dragging a slider stays smooth; the cache holds the newest 32 renders. */
export function gradedPhoto(photo, pw, ph, slot, gradeId, strength) {
  const key = [photo.__id, pw, ph, slot.zoom.toFixed(3), slot.ox.toFixed(3), slot.oy.toFixed(3), gradeId, strength.toFixed(2)].join('|');
  const hit = gradeCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(pw));
  c.height = Math.max(2, Math.round(ph));
  const g = c.getContext('2d');
  const iw = photo.naturalWidth;
  const ih = photo.naturalHeight;
  const scale = Math.max(c.width / iw, c.height / ih) * slot.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  g.drawImage(photo, (c.width - dw) / 2 + slot.ox * c.width, (c.height - dh) / 2 + slot.oy * c.height, dw, dh);
  applyGrade(g, c.width, c.height, gradeId, strength);
  gradeCache.set(key, c);
  if (gradeCache.size > 32) gradeCache.delete(gradeCache.keys().next().value);
  return c;
}

/** A placeholder panel when no photo is loaded yet: a sunset gradient. */
function placeholderPhoto(pw, ph) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(pw));
  c.height = Math.max(2, Math.round(ph));
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, '#2b1055');
  grad.addColorStop(0.55, '#ff5e62');
  grad.addColorStop(1, '#ffb347');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = `400 ${Math.round(c.height * 0.09)}px ${FONT_LABEL}`;
  g.textAlign = 'center';
  g.fillText('YOUR PHOTO HERE', c.width / 2, c.height / 2);
  return c;
}

/**
 * Panel geometry for a layout at W x H. Panels are {x, y, w, h, rot, clip,
 * polaroid, accent}. The title zone is {x, y, w, h}; when `overlay` is true
 * the title floats over the photo on a scrim instead of taking its own band.
 */
export function layoutPanels(id, W, H) {
  const gap = Math.max(2, Math.round(Math.min(W, H) * 0.012));
  const titleH = Math.round(H * 0.22);
  const area = { x: 0, y: 0, w: W, h: H - titleH };
  const title = { x: 0, y: H - titleH, w: W, h: titleH };
  const P = (x, y, w, h, extra = {}) => ({ x, y, w, h, rot: 0, accent: ACCENTS[0], ...extra });
  switch (id) {
    case 'full-bleed':
      return { panels: [P(0, 0, W, H)], title: { x: 0, y: H - titleH, w: W, h: titleH }, overlay: true };
    case 'grid-2x2': {
      const cw = (area.w - gap) / 2;
      const ch = (area.h - gap) / 2;
      return {
        panels: [
          P(area.x, area.y, cw, ch, { accent: ACCENTS[0] }),
          P(area.x + cw + gap, area.y, cw, ch, { accent: ACCENTS[1] }),
          P(area.x, area.y + ch + gap, cw, ch, { accent: ACCENTS[2] }),
          P(area.x + cw + gap, area.y + ch + gap, cw, ch, { accent: ACCENTS[3] }),
        ],
        title,
      };
    }
    case 'grid-3x3': {
      const cw = (area.w - gap * 2) / 3;
      const ch = (area.h - gap * 2) / 3;
      const panels = [];
      for (let r = 0; r < 3; r++) {
        for (let col = 0; col < 3; col++) {
          panels.push(P(area.x + col * (cw + gap), area.y + r * (ch + gap), cw, ch, { accent: ACCENTS[r * 3 + col] }));
        }
      }
      return { panels, title };
    }
    case 'tilted-snapshot': {
      const pw = area.w * 0.3;
      const ph = area.h * 0.76;
      const y = area.y + (area.h - ph) / 2;
      return {
        panels: [
          P(area.x + area.w * 0.03, y, pw, ph, { rot: -5, polaroid: true, accent: ACCENTS[0] }),
          P(area.x + area.w * 0.35, y - area.h * 0.03, pw, ph, { rot: 2, polaroid: true, accent: ACCENTS[1] }),
          P(area.x + area.w * 0.67, y, pw, ph, { rot: 5, polaroid: true, accent: ACCENTS[2] }),
        ],
        title,
        backdrop: true,
      };
    }
    case 'triptych': {
      const cw = (area.w - gap * 2) / 3;
      return {
        panels: [0, 1, 2].map((i) => P(area.x + i * (cw + gap), area.y, cw, area.h, { accent: ACCENTS[i] })),
        title,
      };
    }
    case 'strips': {
      const cw = (area.w - gap * 4) / 5;
      return {
        panels: [0, 1, 2, 3, 4].map((i) => P(area.x + i * (cw + gap), area.y, cw, area.h, { accent: ACCENTS[i] })),
        title,
      };
    }
    case 'diagonal': {
      // Two panels split on a diagonal, each showing a different crop of the
      // photo (photoScale widens the graded render; photoShift picks the
      // window), divided by a white seam.
      const mx = area.w * 0.58;
      const panels = [
        P(area.x, area.y, area.w, area.h, {
          accent: ACCENTS[0],
          photoScale: 1.5,
          photoShift: 0,
          clip: [[area.x, area.y], [area.x + mx, area.y], [area.x + mx - area.w * 0.2, area.y + area.h], [area.x, area.y + area.h]],
        }),
        P(area.x, area.y, area.w, area.h, {
          accent: ACCENTS[1],
          photoScale: 1.5,
          photoShift: 1,
          clip: [[area.x + mx, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x + mx - area.w * 0.2, area.y + area.h]],
        }),
      ];
      return { panels, title, seam: { x1: area.x + mx, y1: area.y, x2: area.x + mx - area.w * 0.2, y2: area.y + area.h } };
    }
    case 'hero-three':
    default: {
      const heroW = area.w * 0.62 - gap / 2;
      const colX = area.x + heroW + gap;
      const colW = area.w - heroW - gap;
      const ch = (area.h - gap * 2) / 3;
      return {
        panels: [
          P(area.x, area.y, heroW, area.h, { accent: ACCENTS[0] }),
          P(colX, area.y, colW, ch, { accent: ACCENTS[1] }),
          P(colX, area.y + ch + gap, colW, ch, { accent: ACCENTS[2] }),
          P(colX, area.y + 2 * (ch + gap), colW, ch, { accent: ACCENTS[3] }),
        ],
        title,
      };
    }
  }
}

/** Draws one photo panel: inked white frame, accent band, graded photo.
 *  A clipped panel (diagonal split) is clipped first, in canvas coordinates,
 *  so its frame and band cannot paint over its sibling panel. */
function drawPanel(ctx, panel, photoCanvas, ink) {
  const { x, y, w, h, rot } = panel;
  ctx.save();
  if (panel.clip) {
    ctx.beginPath();
    ctx.moveTo(panel.clip[0][0], panel.clip[0][1]);
    for (let i = 1; i < panel.clip.length; i++) ctx.lineTo(panel.clip[i][0], panel.clip[i][1]);
    ctx.closePath();
    ctx.clip();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + 4, y + 6, w, h);
  ctx.translate(x + w / 2, y + h / 2);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  const b = ink ? Math.max(2, Math.round(Math.min(w, h) * 0.014)) : 0;
  const extraBottom = panel.polaroid && ink ? b * 3 : 0;
  if (ink) {
    ctx.fillStyle = '#f8f4ec';
    ctx.fillRect(-b, -b, w + 2 * b, h + 2 * b + extraBottom);
  }
  // A widened photo render shows a window of it, so split panels crop differently.
  const sx = panel.photoShift ? Math.round((photoCanvas.width - w) * panel.photoShift) : 0;
  if (sx) ctx.drawImage(photoCanvas, sx, 0, w, h, 0, 0, w, h);
  else ctx.drawImage(photoCanvas, 0, 0, w, h);
  if (ink) {
    ctx.fillStyle = panel.accent;
    ctx.fillRect(-b, -b, w + 2 * b, Math.max(3, Math.round(h * 0.02)));
  }
  ctx.restore();
}

/** Halftone dot field across a rectangle, fading toward its bottom. */
function drawHalftone(ctx, zone) {
  const step = Math.max(6, Math.round(zone.h * 0.09));
  ctx.save();
  for (let yy = zone.y + step / 2; yy < zone.y + zone.h; yy += step) {
    const fade = 1 - (yy - zone.y) / zone.h;
    for (let xx = zone.x + step / 2; xx < zone.x + zone.w; xx += step) {
      const r = step * 0.22 * fade + 0.5;
      ctx.fillStyle = (Math.round(xx / step) + Math.round(yy / step)) % 2 === 0
        ? `rgba(255,94,98,${0.16 * fade})`
        : `rgba(34,211,238,${0.14 * fade})`;
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The title block: sunset-gradient Anton title, neon Pacifico subtitle, heat stars. */
function drawTitleBlock(ctx, zone, state) {
  const { x, y, w, h } = zone;
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#1a0b2e');
  bg.addColorStop(1, '#050308');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  if (state.halftone) drawHalftone(ctx, zone);
  const rule = ctx.createLinearGradient(x, 0, x + w, 0);
  rule.addColorStop(0, '#ff2e88');
  rule.addColorStop(0.5, '#ffb347');
  rule.addColorStop(1, '#22d3ee');
  ctx.fillStyle = rule;
  ctx.fillRect(x, y, w, Math.max(2, Math.round(h * 0.02)));

  const title = (state.title || '').trim().toUpperCase();
  const sub = (state.subtitle || '').trim();
  const cx = x + w / 2;
  let size = h * 0.52;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (title) {
    ctx.font = `${size}px ${FONT_DISPLAY}`;
    while (ctx.measureText(title).width > w * 0.92 && size > 10) {
      size -= 2;
      ctx.font = `${size}px ${FONT_DISPLAY}`;
    }
    const ty = y + h * 0.46;
    const grad = ctx.createLinearGradient(cx - ctx.measureText(title).width / 2, 0, cx + ctx.measureText(title).width / 2, 0);
    grad.addColorStop(0, '#ffe066');
    grad.addColorStop(0.45, '#ff9a3d');
    grad.addColorStop(0.75, '#ff2e88');
    grad.addColorStop(1, '#b537f2');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.strokeText(title, cx, ty);
    ctx.fillStyle = grad;
    ctx.fillText(title, cx, ty);
    ctx.restore();
    if (sub) {
      const subSize = Math.max(10, size * 0.34);
      ctx.font = `${subSize}px ${FONT_SCRIPT}`;
      ctx.save();
      ctx.shadowColor = '#ff2e88';
      ctx.shadowBlur = subSize * 0.55;
      ctx.fillStyle = '#ff8ac2';
      ctx.fillText(sub, cx, ty + size * 0.42);
      ctx.restore();
    }
  }
  // Heat meter: filled stars for the heat, hollow for the rest.
  const heat = Math.max(0, Math.min(5, state.heat | 0));
  if (heat > 0) {
    const starSize = Math.max(10, h * 0.11);
    ctx.font = `${starSize}px ${FONT_LABEL}`;
    const stars = '★'.repeat(heat) + '☆'.repeat(5 - heat);
    ctx.fillStyle = '#ffb347';
    ctx.fillText(stars, cx, y + h * 0.93);
  }
}

/** Badge ribbon pinned to the cover's top-right corner. */
function drawBadge(ctx, W, state) {
  const text = (state.badge || '').trim().toUpperCase();
  if (!text) return;
  const size = Math.max(12, Math.round(W * 0.016));
  ctx.save();
  ctx.font = `${size}px ${FONT_LABEL}`;
  const tw = ctx.measureText(`★ ${text} ★`).width;
  const bw = tw + size * 1.4;
  const bh = size * 1.9;
  ctx.translate(W - bw / 2 - W * 0.012, bh / 2 + W * 0.012);
  ctx.rotate((3 * Math.PI) / 180);
  ctx.fillStyle = '#111016';
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.beginPath();
  ctx.rect(-bw / 2, -bh / 2, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`★ ${text} ★`, 0, 1);
  ctx.restore();
}

let noiseCanvas = null;
function grainPattern(ctx) {
  if (!noiseCanvas) {
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 160;
    noiseCanvas.height = 160;
    const g = noiseCanvas.getContext('2d');
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 34;
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(noiseCanvas, 'repeat');
}

/**
 * Renders the whole cover. `photos` maps photo id -> HTMLImageElement.
 * `state.panels[i]` holds the per-slot photo, zoom and pan; when fillMode is
 * 'one', every panel uses state.fillPhoto.
 */
export function renderCover(ctx, W, H, state, photos) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0518';
  ctx.fillRect(0, 0, W, H);
  const layout = layoutPanels(state.layout, W, H);
  if (layout.backdrop) {
    const bg = ctx.createLinearGradient(0, 0, W, H * 0.78);
    bg.addColorStop(0, '#2b1055');
    bg.addColorStop(0.6, '#7b2d8b');
    bg.addColorStop(1, '#ff5e62');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H * 0.78);
  }
  layout.panels.forEach((panel, i) => {
    const slot = state.panels[i] ?? { photoId: state.fillPhoto, zoom: 1, ox: 0, oy: 0 };
    const photoId = state.fillMode === 'one' ? state.fillPhoto : slot.photoId;
    const photo = photos[photoId];
    const pw = Math.max(2, Math.round(panel.w * (panel.photoScale || 1)));
    const ph = Math.max(2, Math.round(panel.h));
    const pc = photo
      ? gradedPhoto(photo, pw, ph, slot, state.grade, state.gradeStrength)
      : placeholderPhoto(pw, ph);
    drawPanel(ctx, panel, pc, state.inkPanels);
  });
  if (layout.seam) {
    ctx.save();
    ctx.strokeStyle = '#f8f4ec';
    ctx.lineWidth = Math.max(4, Math.round(W * 0.008));
    ctx.beginPath();
    ctx.moveTo(layout.seam.x1, layout.seam.y1);
    ctx.lineTo(layout.seam.x2, layout.seam.y2);
    ctx.stroke();
    ctx.restore();
  }
  if (layout.overlay) {
    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, 'rgba(5,3,8,0)');
    scrim.addColorStop(1, 'rgba(5,3,8,0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  }
  drawTitleBlock(ctx, layout.title, state);
  drawBadge(ctx, W, state);
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.vignette) {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(10,4,20,0)');
    v.addColorStop(1, 'rgba(10,4,20,0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}
