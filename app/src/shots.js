// shots.js — fixed scenes for screenshots: ?shot=cover shows one exported cover
// alone at a post size, ?shot=editor shows the editor with a sample photo.
// `photo` picks a sample, `caption` the title, `layout` / `grade` / `size`
// override the cover; window.__shotReady is set once painted.
import { layoutPanels } from './cover.js';

export const SIZES = {
  square: { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  story: { w: 1080, h: 1350, label: 'Story 1080 x 1350' },
  wide: { w: 1920, h: 1080, label: 'Wide 1920 x 1080' },
};

export async function runShot(shot, query, setup) {
  const layout = query.get('layout');
  const grade = query.get('grade');
  const size = SIZES[query.get('size')] ?? SIZES.square;
  if (shot === 'cover') document.body.classList.add('shot-cover');
  await setup({
    photo: query.get('photo') ?? 'pier',
    caption: query.get('caption') ?? 'Sunset Heist',
    layout: layout ?? undefined,
    grade: grade ?? undefined,
    size,
    shot,
  });
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.load('40px "Bebas Neue"'),
    ]);
    await document.fonts.ready;
  } catch { /* system fonts are an acceptable fallback for a shot */ }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}

/** Hit-tests a point (canvas CSS pixels) against the layout's panels. */
export function panelAt(state, W, H, px, py) {
  const layout = layoutPanels(state.layout, W, H);
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    const p = layout.panels[i];
    if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return i;
  }
  return -1;
}
