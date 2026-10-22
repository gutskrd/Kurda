/**
 * What is cut into each crest's stone, in the glyph's own −1…1 square: the
 * place each rank is named for, and the water each league is.
 *
 * Bold, few-part shapes, because they are read at the size of a thumbnail as
 * often as at full size — the outline of a tent, not its ropes.
 */
import type { Glyph } from './crest.js';

/** A path through points, closed. */
const shape = (p: (x: number, y: number) => string, pts: readonly (readonly [number, number])[]): string =>
  `M${pts.map(([x, y]) => p(x, y)).join('L')}Z`;

/** A small almond, pointed both ends, centred on x,y and turned by `deg`. */
function grain(p: (x: number, y: number) => string, x: number, y: number, len: number, w: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (u: number, v: number): string => p(x + u * c - v * s, y + u * s + v * c);
  return `M${at(-len / 2, 0)}Q${at(0, -w)} ${at(len / 2, 0)}Q${at(0, w)} ${at(-len / 2, 0)}Z`;
}

/** A circle, as two arcs, through the glyph's mapping (its radius in glyph units, measured along x). */
function dot(p: (x: number, y: number) => string, x: number, y: number, r: number): string {
  return `M${p(x - r, y)}Q${p(x - r, y - r)} ${p(x, y - r)}Q${p(x + r, y - r)} ${p(x + r, y)}Q${p(x + r, y + r)} ${p(x, y + r)}Q${p(x - r, y + r)} ${p(x - r, y)}Z`;
}

export const RANK_GLYPHS = {
  /** Deşt, the plain: an ear of wheat */
  dest: ((p) => ({
    fill:
      grain(p, 0, -0.78, 0.42, 0.13, 90) +
      [-0.48, -0.12, 0.24].map((y) => grain(p, -0.2, y, 0.44, 0.14, 62) + grain(p, 0.2, y, 0.44, 0.14, 118)).join(''),
    stroke: `M${p(0, 0.95)}L${p(0, -0.55)}`,
    width: 0.14,
  })) satisfies Glyph,
  /** Gir, the hills: two rolling hills, one behind the other */
  gir: ((p) => ({
    faint: `M${p(-1, 0.62)}Q${p(-0.42, -0.62)} ${p(0.2, 0.62)}Z`,
    fill: `M${p(-0.3, 0.62)}Q${p(0.36, -0.28)} ${p(1, 0.62)}Z`,
  })) satisfies Glyph,
  /** Zozan, the high pasture: the black tent */
  zozan: ((p) => ({
    fill: shape(p, [
      [-1, 0.56],
      [-0.66, -0.16],
      [-0.26, -0.02],
      [0, -0.46],
      [0.26, -0.02],
      [0.66, -0.16],
      [1, 0.56],
      [0.16, 0.56],
      [0, 0.18],
      [-0.16, 0.56],
    ]),
  })) satisfies Glyph,
  /** Çiya, the mountain: a peak with a second one behind it */
  ciya: ((p) => ({
    faint: shape(p, [
      [0.05, 0.62],
      [0.5, -0.2],
      [1, 0.62],
    ]),
    fill: shape(p, [
      [-1, 0.62],
      [-0.22, -0.74],
      [0.08, -0.26],
      [0.62, 0.62],
    ]),
  })) satisfies Glyph,
  /** Lûtke, the summit: a peak with a flag on it */
  lutke: ((p) => ({
    fill:
      shape(p, [
        [-1, 0.66],
        [-0.12, -0.42],
        [0.9, 0.66],
      ]) +
      shape(p, [
        [-0.06, -1.0],
        [0.52, -0.84],
        [-0.06, -0.66],
      ]),
    stroke: `M${p(-0.12, -0.42)}L${p(-0.1, -1.02)}`,
    width: 0.1,
  })) satisfies Glyph,
  /** Stêrk, the star: the sun's disc with its rays */
  sterk: ((p) => ({
    fill: dot(p, 0, 0, 0.34),
    stroke: Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `M${p(Math.cos(a) * 0.52, Math.sin(a) * 0.52)}L${p(Math.cos(a) * 0.86, Math.sin(a) * 0.86)}`;
    }).join(''),
    width: 0.14,
  })) satisfies Glyph,
} as const;

export const LEAGUE_GLYPHS = {
  /** Dilop, the drop: a leaf, the dew's first home */
  dilop: ((p) => ({
    fill: `M${p(-0.86, 0.66)}Q${p(-0.74, -0.6)} ${p(0.84, -0.74)}Q${p(0.7, 0.58)} ${p(-0.86, 0.66)}Z`,
    stroke: `M${p(-0.62, 0.44)}L${p(0.42, -0.4)}`,
    width: 0.08,
  })) satisfies Glyph,
  /** Kanî, the spring: bubbles rising */
  kani: ((p) => ({
    fill: dot(p, -0.34, 0.46, 0.26) + dot(p, 0.18, -0.02, 0.32) + dot(p, 0.48, -0.62, 0.2),
  })) satisfies Glyph,
  /** Çem, the river: water running */
  cem: ((p) => ({
    stroke: [-0.42, 0.06, 0.54]
      .map((y) => `M${p(-0.92, y)}Q${p(-0.68, y - 0.26)} ${p(-0.46, y)}T${p(0, y)}T${p(0.46, y)}T${p(0.92, y)}`)
      .join(''),
    width: 0.16,
  })) satisfies Glyph,
  /** Gol, the lake: a peak and its reflection */
  gol: ((p) => ({
    fill: shape(p, [
      [-0.9, 0.04],
      [-0.08, -0.9],
      [0.74, 0.04],
    ]),
    faint: shape(p, [
      [-0.9, 0.22],
      [-0.08, 0.96],
      [0.74, 0.22],
    ]),
  })) satisfies Glyph,
  /** Derya, the sea: the sun on the horizon over the waves */
  derya: ((p) => ({
    fill: `M${p(-0.54, 0.0)}Q${p(-0.54, -0.56)} ${p(0, -0.56)}Q${p(0.54, -0.56)} ${p(0.54, 0.0)}Z`,
    stroke: [0.28, 0.66].map((y) => `M${p(-0.92, y)}Q${p(-0.69, y - 0.22)} ${p(-0.46, y)}T${p(0, y)}T${p(0.46, y)}T${p(0.92, y)}`).join(''),
    width: 0.15,
  })) satisfies Glyph,
  /** Okyanûs, the ocean: a whale's tail rising from it */
  okyanus: ((p) => ({
    fill: `M${p(-0.08, 0.5)}C${p(-0.06, 0.06)} ${p(-0.2, -0.24)} ${p(-0.86, -0.56)}Q${p(-0.38, -0.08)} ${p(0, -0.14)}Q${p(0.38, -0.08)} ${p(0.86, -0.56)}C${p(0.2, -0.24)} ${p(0.06, 0.06)} ${p(0.08, 0.5)}Z`,
    stroke: `M${p(-0.94, 0.66)}Q${p(-0.7, 0.44)} ${p(-0.47, 0.66)}T${p(0, 0.66)}T${p(0.47, 0.66)}T${p(0.94, 0.66)}`,
    width: 0.15,
  })) satisfies Glyph,
} as const;
