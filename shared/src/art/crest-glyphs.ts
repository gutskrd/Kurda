/**
 * What is cut into each crest's stone, in the glyph's own −1…1 square: the
 * place each rank is named for, and the water each league is.
 *
 * Every glyph is drawn about the middle line, its left half the mirror of its
 * right, so it sits in its stone the way the crest sits on the page. Bold,
 * few-part shapes, because they are read at the size of a thumbnail as often
 * as at full size — the outline of a tent, not its ropes.
 */
import type { Glyph } from './crest.js';

type Map = (x: number, y: number) => string;

/** A path through points, closed. */
const shape = (p: Map, pts: readonly (readonly [number, number])[]): string => `M${pts.map(([x, y]) => p(x, y)).join('L')}Z`;

/** The same points mirrored across the middle line, for building the left half from the right. */
const both = (right: readonly (readonly [number, number])[]): [number, number][] => [
  ...right.map(([x, y]) => [x, y] as [number, number]),
  ...[...right].reverse().map(([x, y]) => [-x, y] as [number, number]),
];

/** A small almond, pointed both ends, centred on x,y and turned by `deg` (0 along x). */
function grain(p: Map, x: number, y: number, len: number, w: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (u: number, v: number): string => p(x + u * c - v * s, y + u * s + v * c);
  return `M${at(-len / 2, 0)}Q${at(0, -w)} ${at(len / 2, 0)}Q${at(0, w)} ${at(-len / 2, 0)}Z`;
}

/** A circle, through the glyph's mapping. */
function dot(p: Map, x: number, y: number, r: number): string {
  const k = r * 0.552;
  return `M${p(x - r, y)}C${p(x - r, y - k)} ${p(x - k, y - r)} ${p(x, y - r)}C${p(x + k, y - r)} ${p(x + r, y - k)} ${p(x + r, y)}C${p(x + r, y + k)} ${p(x + k, y + r)} ${p(x, y + r)}C${p(x - k, y + r)} ${p(x - r, y + k)} ${p(x - r, y)}Z`;
}

/** A water drop, its point up, centred on x,y, `k` tall from point to foot over two. */
function drop(p: Map, x: number, y: number, k: number): string {
  const at = (u: number, v: number): string => p(x + u * k, y + v * k);
  return (
    `M${at(0, -1)}C${at(0.28, -0.56)} ${at(0.68, -0.14)} ${at(0.68, 0.26)}C${at(0.68, 0.66)} ${at(0.36, 0.94)} ${at(0, 0.94)}` +
    `C${at(-0.36, 0.94)} ${at(-0.68, 0.66)} ${at(-0.68, 0.26)}C${at(-0.68, -0.14)} ${at(-0.28, -0.56)} ${at(0, -1)}Z`
  );
}

/** A line of water: two equal arches either side of the middle. */
const wave = (p: Map, y: number, w = 0.92, h = 0.3): string => `M${p(-w, y)}Q${p(-w / 2, y - h)} ${p(0, y)}Q${p(w / 2, y - h)} ${p(w, y)}`;

/** A peak with a softly rounded top, standing on y = foot. */
const peakShape = (p: Map, top: number, foot: number, half: number): string =>
  `M${p(-half, foot)}L${p(-0.08, top + 0.08)}Q${p(0, top - 0.02)} ${p(0.08, top + 0.08)}L${p(half, foot)}Z`;

/** One ear of wheat: a stem from `base` along an angle from straight up, grains in pairs leaning out from it, one at its tip. */
function ear(p: Map, bx: number, by: number, tiltDeg: number, len: number): { grains: string; stem: string } {
  const t = (tiltDeg * Math.PI) / 180;
  const u: [number, number] = [Math.sin(t), -Math.cos(t)];
  const along = (k: number): [number, number] => [bx + u[0] * len * k, by + u[1] * len * k];
  const stemDeg = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  const g = 0.3;
  const out: string[] = [];
  for (const k of [0.46, 0.64, 0.82]) {
    const [cx, cy] = along(k);
    for (const side of [-1, 1]) {
      const deg = stemDeg + side * 34;
      const a = (deg * Math.PI) / 180;
      out.push(grain(p, cx + Math.cos(a) * g * 0.42, cy + Math.sin(a) * g * 0.42, g, 0.1, deg));
    }
  }
  const [tx, ty] = along(0.98);
  out.push(grain(p, tx, ty, g, 0.1, stemDeg));
  const [ex, ey] = along(0.86);
  return { grains: out.join(''), stem: `M${p(bx, by)}L${p(ex, ey)}` };
}

export const RANK_GLYPHS = {
  /** Deşt, the plain: a sheaf of three ears of wheat, tied */
  dest: ((p) => {
    const ears = [ear(p, 0, 0.92, 0, 1.78), ear(p, 0, 0.92, -24, 1.5), ear(p, 0, 0.92, 24, 1.5)];
    return {
      fill: ears.map((e) => e.grains).join(''),
      stroke: ears.map((e) => e.stem).join('') + `M${p(-0.2, 0.5)}L${p(0.2, 0.5)}`,
      width: 0.11,
    };
  }) satisfies Glyph,
  /** Gir, the hills: a round hill between two lower ones, one rolling line, the sun over them */
  gir: ((p) => ({
    fill:
      `M${p(-1, 0.6)}C${p(-0.96, 0.18)} ${p(-0.74, 0.02)} ${p(-0.56, 0.02)}C${p(-0.46, 0.02)} ${p(-0.4, 0.06)} ${p(-0.34, 0.1)}` +
      `C${p(-0.24, -0.34)} ${p(-0.12, -0.42)} ${p(0, -0.42)}C${p(0.12, -0.42)} ${p(0.24, -0.34)} ${p(0.34, 0.1)}` +
      `C${p(0.4, 0.06)} ${p(0.46, 0.02)} ${p(0.56, 0.02)}C${p(0.74, 0.02)} ${p(0.96, 0.18)} ${p(1, 0.6)}Z`,
    faint: dot(p, 0, -0.8, 0.2),
  })) satisfies Glyph,
  /** Zozan, the high pasture: the black tent, its door open */
  zozan: ((p) => ({
    fill:
      shape(
        p,
        both([
          [0, -0.58],
          [0.36, -0.08],
          [0.7, -0.18],
          [1, 0.6],
        ]),
      ) +
      shape(p, [
        [-0.24, 0.6],
        [0, 0.02],
        [0.24, 0.6],
      ]),
  })) satisfies Glyph,
  /** Çiya, the mountain: a peak with its snow line, two lower ones behind it */
  ciya: ((p) => ({
    faint:
      shape(p, [
        [-1, 0.62],
        [-0.64, 0.02],
        [-0.3, 0.62],
      ]) +
      shape(p, [
        [1, 0.62],
        [0.64, 0.02],
        [0.3, 0.62],
      ]),
    fill:
      peakShape(p, -0.68, 0.62, 0.9) +
      shape(p, [
        [-0.36, -0.08],
        [-0.18, 0.06],
        [0, -0.08],
        [0.18, 0.06],
        [0.36, -0.08],
        [0.4, 0.03],
        [0.18, 0.17],
        [0, 0.03],
        [-0.18, 0.17],
        [-0.4, 0.03],
      ]),
  })) satisfies Glyph,
  /** Lûtke, the summit: the peak with a star over it, the climb's end */
  lutke: ((p) => {
    const r = 0.3;
    const cy = -0.66;
    const w = r * 0.24;
    return {
      faint:
        shape(p, [
          [-1, 0.66],
          [-0.66, 0.16],
          [-0.34, 0.66],
        ]) +
        shape(p, [
          [1, 0.66],
          [0.66, 0.16],
          [0.34, 0.66],
        ]),
      fill:
        peakShape(p, -0.18, 0.66, 0.86) +
        `M${p(0, cy - r)}Q${p(w, cy - w)} ${p(r, cy)}Q${p(w, cy + w)} ${p(0, cy + r)}Q${p(-w, cy + w)} ${p(-r, cy)}Q${p(-w, cy - w)} ${p(0, cy - r)}Z`,
    };
  }) satisfies Glyph,
  /** Stêrk, the star: the eight-pointed star of the kilims, its four long points on the compass and four short ones between */
  sterk: ((p) => ({
    fill: shape(
      p,
      Array.from({ length: 16 }, (_, i) => {
        const a = ((-90 + 22.5 * i) * Math.PI) / 180;
        const r = i % 2 === 1 ? 0.36 : i % 4 === 0 ? 1 : 0.64;
        return [Math.cos(a) * r, Math.sin(a) * r] as const;
      }),
    ),
  })) satisfies Glyph,
} as const;

export const LEAGUE_GLYPHS = {
  /** Dilop, the drop */
  dilop: ((p) => ({ fill: drop(p, 0, 0.0, 0.86) })) satisfies Glyph,
  /** Kanî, the spring: water welling up, a drop and two smaller ones beside it */
  kani: ((p) => ({ fill: drop(p, 0, -0.2, 0.6) + drop(p, -0.6, 0.34, 0.38) + drop(p, 0.6, 0.34, 0.38) })) satisfies Glyph,
  /** Çem, the river: water running */
  cem: ((p) => ({ stroke: wave(p, -0.4) + wave(p, 0.06) + wave(p, 0.52), width: 0.17 })) satisfies Glyph,
  /** Gol, the lake: a peak over still water */
  gol: ((p) => ({
    fill: peakShape(p, -0.84, 0.14, 0.86),
    stroke: `M${p(-0.84, 0.44)}L${p(0.84, 0.44)}M${p(-0.5, 0.72)}L${p(0.5, 0.72)}`,
    width: 0.15,
  })) satisfies Glyph,
  /** Derya, the sea: the sun on the horizon over the waves */
  derya: ((p) => ({
    fill: `M${p(-0.54, 0.02)}C${p(-0.54, -0.7)} ${p(0.54, -0.7)} ${p(0.54, 0.02)}Z`,
    stroke: wave(p, 0.34) + wave(p, 0.72),
    width: 0.16,
  })) satisfies Glyph,
  /** Okyanûs, the ocean: a whale's tail rising from it */
  okyanus: ((p) => ({
    fill:
      `M${p(-0.16, 0.46)}C${p(-0.12, 0.3)} ${p(-0.1, 0.1)} ${p(-0.16, -0.02)}C${p(-0.46, -0.06)} ${p(-0.78, -0.22)} ${p(-0.94, -0.66)}` +
      `Q${p(-0.36, -0.16)} ${p(0, -0.24)}Q${p(0.36, -0.16)} ${p(0.94, -0.66)}` +
      `C${p(0.78, -0.22)} ${p(0.46, -0.06)} ${p(0.16, -0.02)}C${p(0.1, 0.1)} ${p(0.12, 0.3)} ${p(0.16, 0.46)}Z`,
    stroke: wave(p, 0.66, 0.94, 0.26),
    width: 0.15,
  })) satisfies Glyph,
} as const;
