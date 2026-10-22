import { n, prefixFor } from '../art/svg.js';
import type { CharacterId } from './types.js';

/**
 * The light each character stands in on a stage: the deer in the purple of
 * his app icon, Hamo in the gold of an evening, Xezo in rose.
 */
export const CHARACTER_GLOW: Readonly<Record<CharacterId, { light: string; deep: string }>> = {
  hevalo: { light: '#db7df5', deep: '#9a6cf1' },
  hamo: { light: '#f6c27a', deep: '#de8746' },
  xezo: { light: '#f5a3b5', deep: '#cf5f7b' },
};

export interface StageOptions {
  /** drawn for a dark screen: the same light, a little stronger on the dark */
  dark?: boolean;
  /** for gradient ids, so two stages can share a page */
  idPrefix?: string;
}

/**
 * What a character stands in front of on a stage: nothing but its own light,
 * a soft wash of its colour that deepens a little toward the stage's foot and
 * is brightest behind its head, so the figure is all there is to look at.
 *
 * Drawn to the stage's own size in points; everything is a tint over the
 * surface beneath, so it sits on a light card and a dark one alike. `standAt`
 * is the share of the width the character stands at, where the light is
 * centred.
 */
export function stageBackdrop(id: CharacterId, width: number, height: number, standAt = 0.32, options: StageOptions = {}): string {
  const glow = CHARACTER_GLOW[id];
  const p = `${prefixFor(options.idPrefix ?? `stage${id}`)}-`;
  const dark = options.dark === true;
  const w = width;
  const h = height;
  const wash = dark ? [0.34, 0.14, 0.24] : [0.3, 0.1, 0.16];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" aria-hidden="true">` +
    '<defs>' +
    `<linearGradient id="${p}wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${glow.light}" stop-opacity="${wash[0]}"/>` +
    `<stop offset="0.6" stop-color="${glow.light}" stop-opacity="${wash[1]}"/><stop offset="1" stop-color="${glow.deep}" stop-opacity="${wash[2]}"/></linearGradient>` +
    `<radialGradient id="${p}glow" gradientUnits="userSpaceOnUse" cx="${n(standAt * w)}" cy="${n(h * 0.36)}" r="${n(Math.max(w, h) * 0.55)}"><stop offset="0" stop-color="${glow.light}" stop-opacity="${dark ? 0.42 : 0.38}"/><stop offset="1" stop-color="${glow.light}" stop-opacity="0"/></radialGradient>` +
    '</defs>' +
    `<rect width="${n(w)}" height="${n(h)}" fill="url(#${p}wash)"/>` +
    `<rect width="${n(w)}" height="${n(h)}" fill="url(#${p}glow)"/>` +
    '</svg>'
  );
}
