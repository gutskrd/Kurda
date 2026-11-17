/**
 * Shared lighting for badges, emblems and frames, so all are lit like an enamel pin under one soft light from the upper
 * left: a smooth metal rim, enamel set a little below it (so the rim's lip is shaded at the top and lit at the bottom),
 * one soft gloss, and a short shadow in the piece's own colour. Every shape is rounded, never faceted.
 */
import type { Metal } from './palette.js';
import type { Drawing, Pt } from './svg.js';
import { linearAt, linearBox, n, n2, pt, radialBox } from './svg.js';
import { roundPath } from './geometry.js';
import { circ } from './icons.js';

/** A metal, optionally with mother-of-pearl sheen colours to run through instead. */
export type RimMetal = Metal & { sheen?: readonly string[] };

/** The bright half of a metal, lit from above over each shape's own box; glyphs are filled with it. */
export function metalBox(dr: Drawing, m: Metal): string {
  const id = dr.id('b');
  dr.def(
    linearBox(id, [
      [0, m.hi],
      [1, m.light],
    ]),
  );
  return id;
}

/** The metal's shaded face, over each shape's own box. */
export function metalBoxDark(dr: Drawing, m: Metal): string {
  const id = dr.id('b');
  dr.def(
    linearBox(id, [
      [0, m.light],
      [1, m.mid],
    ]),
  );
  return id;
}

/**
 * A rim's metal gradient over a piece centred on cx,cy with reach `r`: highlight at the upper left, shade at the lower
 * right, or the sheen's colours instead. Returns the gradient id.
 */
export function rimMetal(dr: Drawing, m: RimMetal, cx: number, cy: number, r: number): string {
  const id = dr.id('m');
  const stops: [number, string][] = m.sheen
    ? m.sheen.map((c, i, all) => [i / Math.max(1, all.length - 1), c])
    : [
        [0, m.hi],
        [0.3, m.light],
        [0.7, m.mid],
        [1, m.dark],
      ];
  dr.def(linearAt(id, stops, cx - r * 0.7, cy - r * 0.8, cx + r * 0.7, cy + r * 0.8));
  return id;
}

/** The lip, the rim's inside edge: shaded at the upper left, where the rim stands over the enamel, and lit at the lower right. */
export function lipMetal(dr: Drawing, m: Metal, cx: number, cy: number, r: number): string {
  const id = dr.id('m');
  dr.def(
    linearAt(
      id,
      [
        [0, m.dark],
        [0.5, m.mid],
        [1, m.hi],
      ],
      cx - r * 0.6,
      cy - r * 0.8,
      cx + r * 0.6,
      cy + r * 0.8,
    ),
  );
  return id;
}

/** A small diamond, the commonest kilim mark. */
export function diamondAt(cx: number, cy: number, w: number, h: number, deg = 0): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = (x: number, y: number): string => `${n(cx + x * c - y * s)},${n(cy + x * s + y * c)}`;
  return `M${p(0, -h / 2)}L${p(w / 2, 0)} ${p(0, h / 2)} ${p(-w / 2, 0)}Z`;
}

/** A capsule centred on cx,cy. */
export function capsule(cx: number, cy: number, w: number, h: number): string {
  const r = h / 2;
  return `M${n(cx - w / 2 + r)},${n(cy - r)}H${n(cx + w / 2 - r)}A${n(r)},${n(r)} 0 0 1 ${n(cx + w / 2 - r)},${n(cy + r)}H${n(cx - w / 2 + r)}A${n(r)},${n(r)} 0 0 1 ${n(cx - w / 2 + r)},${n(cy - r)}Z`;
}

/** A ring between two radii, as one even-odd path. */
export function ring(cx: number, cy: number, outer: number, inner: number): string {
  return `${circ(cx, cy, outer)}${circ(cx, cy, inner)}`;
}

/** Dots at the given points, as one path. */
export function dotsAt(points: readonly Pt[], r: number): string {
  return points.map(([x, y]) => circ(x, y, r)).join('');
}

/** `count` points round a circle, the first at the top (or `phase` of a step past it). */
export function roundAbout(cx: number, cy: number, r: number, count: number, phase = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i + phase) / count) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * A kilim band along a rim: small diamonds with a dark eye, a bead between each pair. `marks` give each diamond's place
 * and the rim's direction there.
 */
export function kilimAlong(marks: readonly { p: Pt; angle: number }[], size: number, light: string, eye: string): string {
  const gems: string[] = [];
  const eyes: string[] = [];
  const beads: Pt[] = [];
  marks.forEach((s, i) => {
    const next = marks[(i + 1) % marks.length] as { p: Pt };
    gems.push(diamondAt(s.p[0], s.p[1], size * 1.12, size * 0.92, s.angle));
    eyes.push(diamondAt(s.p[0], s.p[1], size * 0.44, size * 0.36, s.angle));
    beads.push([(s.p[0] + next.p[0]) / 2, (s.p[1] + next.p[1]) / 2]);
  });
  return `<path d="${gems.join('')}${dotsAt(beads, size * 0.2)}" fill="${light}"/><path d="${eyes.join('')}" fill="${eye}"/>`;
}

/** A kilim band round a circle. */
export function kilimRing(cx: number, cy: number, r: number, count: number, size: number, light: string, eye: string): string {
  return kilimAlong(
    roundAbout(cx, cy, r, count).map((p, i) => ({ p, angle: (i / count) * 360 })),
    size,
    light,
    eye,
  );
}

/**
 * Pips in a row centred on cx,cy, counting the division or tier so colour is never the only signal: a lit pip is a
 * raised metal bead, an unlit one an empty socket.
 */
export function pips(dr: Drawing, m: Metal, count: number, lit: number, cx: number, cy: number, r: number, gap: number): string {
  const bead = dr.id('pip');
  dr.def(
    radialBox(
      bead,
      [
        [0, m.hi],
        [0.55, m.light],
        [1, m.mid],
      ],
      0.38,
      0.32,
      0.7,
    ),
  );
  const x0 = cx - ((count - 1) * (r * 2 + gap)) / 2;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (r * 2 + gap);
    out.push(
      i < lit
        ? `<circle cx="${n(x)}" cy="${n(cy)}" r="${n2(r)}" fill="url(#${bead})" stroke="${m.deep}" stroke-width="${n2(r * 0.3)}"/>`
        : `<circle cx="${n(x)}" cy="${n(cy)}" r="${n2(r - r * 0.12)}" fill="${m.deep}" fill-opacity="0.22" stroke="${m.mid}" stroke-width="${n2(r * 0.34)}"/>`,
    );
  }
  return out.join('');
}

export interface LaurelOptions {
  cx: number;
  cy: number;
  /** The radius the stems follow. */
  r: number;
  /** Where the right-hand stem starts and ends, in degrees (90 straight down, 0 right, −90 the top). */
  from: number;
  to: number;
  /** Leaves on each side of each stem. */
  leaves: number;
  /** A leaf's length and width at the stem's foot; they taper toward the tip. */
  len: number;
  width: number;
  m: Metal;
  /** Stroke the leaves' edges, for large sizes. */
  edged: boolean;
}

/** One leaf: a soft almond from its base along `u`, as path data. */
export function leaf(base: Pt, u: Pt, len: number, w: number): string {
  const v: Pt = [-u[1], u[0]];
  const at = (s: number, o: number): Pt => [base[0] + u[0] * s + v[0] * o, base[1] + u[1] * s + v[1] * o];
  return `M${pt(base)}C${pt(at(len * 0.28, w))} ${pt(at(len * 0.78, w * 0.78))} ${pt(at(len, 0))}C${pt(at(len * 0.78, -w * 0.78))} ${pt(at(len * 0.28, -w))} ${pt(base)}Z`;
}

const rot = (u: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return [u[0] * Math.cos(a) - u[1] * Math.sin(a), u[0] * Math.sin(a) + u[1] * Math.cos(a)];
};

/**
 * A pair of laurel branches mirrored about cx, rising from a piece's foot up its sides with leaves shrinking toward the
 * tip. Draw it before the piece so the inner leaves tuck behind the rim. Returns markup.
 */
export function laurel(o: LaurelOptions): string {
  const { cx, cy, r, from, to, leaves, len, width, m, edged } = o;
  const outer: string[] = [];
  const inner: string[] = [];
  const dir = Math.sign(to - from) || 1;
  const mirror = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  const mirrorU = (u: Pt): Pt => [-u[0], u[1]];
  for (let k = 0; k <= leaves; k++) {
    const t = k / leaves;
    const deg = from + (to - from) * Math.min(1, t * 0.94 + 0.03);
    const a = (deg * Math.PI) / 180;
    const base: Pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    // The stem's direction here, and which way is out.
    const grow: Pt = [-Math.sin(a) * dir, Math.cos(a) * dir];
    const taper = 1 - 0.38 * t;
    const l = len * taper;
    const w = width * taper;
    const outward = dir > 0 ? -1 : 1;
    if (k === leaves) {
      // The tip: one leaf straight on along the stem.
      outer.push(leaf(base, grow, l * 0.9, w * 0.9), leaf(mirror(base), mirrorU(grow), l * 0.9, w * 0.9));
      break;
    }
    const uo = rot(grow, 40 * outward);
    const ui = rot(grow, -40 * outward);
    outer.push(leaf(base, uo, l, w), leaf(mirror(base), mirrorU(uo), l, w));
    inner.push(leaf(base, ui, l * 0.9, w * 0.9), leaf(mirror(base), mirrorU(ui), l * 0.9, w * 0.9));
  }
  const a0 = (from * Math.PI) / 180;
  const a1 = ((from + (to - from) * 0.97) * Math.PI) / 180;
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  const stem = (sx: number): string => {
    const p0: Pt = [cx + sx * Math.cos(a0) * r, cy + Math.sin(a0) * r];
    const p1: Pt = [cx + sx * Math.cos(a1) * r, cy + Math.sin(a1) * r];
    return `M${pt(p0)}A${n(r)},${n(r)} 0 ${large} ${sx > 0 ? sweep : 1 - sweep} ${pt(p1)}`;
  };
  const line = edged ? ` stroke="${m.dark}" stroke-width="0.8" stroke-linejoin="round"` : '';
  return (
    `<path d="${stem(1)}${stem(-1)}" fill="none" stroke="${m.dark}" stroke-width="${edged ? 1.6 : 2.4}" stroke-linecap="round"/>` +
    `<path d="${inner.join('')}" fill="${m.mid}"${line}/>` +
    `<path d="${outer.join('')}" fill="${m.light}"${line}/>`
  );
}

/**
 * A crown of three rounded peaks with a pearl on each, or for the top tier a soft star on the middle one. Its foot
 * tucks behind the piece's rim. Returns markup.
 */
export function crown(dr: Drawing, m: Metal, cx: number, foot: number, w: number, h: number, top: 'pearls' | 'star' | 'none', starR = w * 0.24): string {
  const v: Pt[] = [
    [cx - w / 2, foot],
    [cx - w * 0.42, foot - h * 0.72],
    [cx - w * 0.2, foot - h * 0.44],
    [cx, foot - h],
    [cx + w * 0.2, foot - h * 0.44],
    [cx + w * 0.42, foot - h * 0.72],
    [cx + w / 2, foot],
  ];
  const d = roundPath(v, [1, h * 0.26, h * 0.14, h * 0.3, h * 0.14, h * 0.26, 1]);
  const metal = rimMetal(dr, m, cx, foot - h / 2, w * 0.6);
  const out = [`<path d="${d}" fill="url(#${metal})" stroke="${m.deep}" stroke-width="1.2" stroke-linejoin="round"/>`];
  if (top === 'pearls') {
    const r = Math.max(1.6, w * 0.075);
    out.push(
      `<path d="${circ(cx - w * 0.42, foot - h * 0.72 - r * 0.2, r)}${circ(cx, foot - h - r * 0.2, r * 1.1)}${circ(cx + w * 0.42, foot - h * 0.72 - r * 0.2, r)}" fill="${m.hi}" stroke="${m.deep}" stroke-width="0.9"/>`,
    );
  }
  if (top === 'star') {
    const s = starR;
    out.push(`<path d="${softStar(cx, foot - h - s * 0.25, s)}" fill="url(#${metal})" stroke="${m.deep}" stroke-width="1.1" stroke-linejoin="round"/>`);
    out.push(`<path d="${circ(cx - w * 0.42, foot - h * 0.72 - 0.4, Math.max(1.6, w * 0.075))}${circ(cx + w * 0.42, foot - h * 0.72 - 0.4, Math.max(1.6, w * 0.075))}" fill="${m.hi}" stroke="${m.deep}" stroke-width="0.9"/>`);
  }
  return out.join('');
}

/** A five-point star with every point and notch rounded. */
export function softStar(cx: number, cy: number, r: number, inner = 0.5): string {
  const v: Pt[] = [];
  const radii: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * inner;
    v.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    radii.push(i % 2 === 0 ? r * 0.26 : r * 0.12);
  }
  return roundPath(v, radii);
}
