/**
 * The pen the characters are drawn with. Outlines are a few placed points with a smooth curve through them; a point can be
 * a corner or a tighter or looser bend. The curve leaves each point along the bisector of its angle and reaches a third of
 * the way to the next, so it never bulges far past its points, even unevenly spaced ones. Points are rounded to a tenth
 * first and paths are written as steps between rounded points: short, exact and the same on every machine, as
 * `art/svg.ts` requires.
 */
import type { Pt } from '../art/svg.js';
import { n, n2 } from '../art/svg.js';

/** A point on an outline: x, y and how round the curve runs through it (1 by default, 0 for a corner). */
export type Knot = readonly [number, number] | readonly [number, number, number];

const tenths = (v: number): number => Math.round(v * 10);
/** A whole number of tenths, as written into a path. */
const w = (t: number): string => n(t / 10);

/**
 * A smooth path through `knots`, closed unless `closed` is false. Each point's two handles are the same length, a third of
 * the shorter neighbouring side (or of the average when the sides are close), so the curve passes through symmetrically
 * and each segment after a smooth point can use the short `s` step. Relative steps keep a small shape far from the origin
 * cheap.
 */
export function curve(knots: readonly Knot[], closed = true): string {
  const count = knots.length;
  if (count === 0) return '';
  const pts = knots.map((k) => [tenths(k[0]), tenths(k[1])] as const);
  const round = knots.map((k) => k[2] ?? 1);
  const at = (i: number): readonly [number, number] =>
    pts[closed ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i))] as readonly [number, number];
  // Each point's handle in whole tenths, along the line halfway between the way in and the way out.
  const handles = pts.map((p, i) => {
    const a = at(i - 1);
    const b = at(i + 1);
    const lu = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const lv = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const dx = (lu ? (p[0] - a[0]) / lu : 0) + (lv ? (b[0] - p[0]) / lv : 0);
    const dy = (lu ? (p[1] - a[1]) / lu : 0) + (lv ? (b[1] - p[1]) / lv : 0);
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) return [0, 0] as const;
    const short = Math.min(lu || lv, lv || lu);
    const reach = (Math.min(short * 1.25, (lu + lv) / 2) / 3) * (round[i] ?? 1);
    return [Math.round((dx / l) * reach), Math.round((dy / l) * reach)] as const;
  });
  const first = at(0);
  let d = `M${w(first[0])},${w(first[1])}`;
  const segments = closed ? count : count - 1;
  // Whether the previous step was a curve whose last handle mirrors this point's out-handle.
  let mirrored = false;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % count;
    const a = at(i);
    const b = at(j);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const ra = round[i] ?? 1;
    const rb = round[j] ?? 1;
    if (dx === 0 && dy === 0) {
      mirrored = false;
      continue;
    }
    if (ra === 0 && rb === 0) {
      d += `l${w(dx)},${w(dy)}`;
      mirrored = false;
      continue;
    }
    const ha = handles[i] as readonly [number, number];
    const hb = handles[j] as readonly [number, number];
    // An open curve's ends have no way in or out to share, so their handles are flat.
    const startFlat = !closed && i === 0;
    const endFlat = !closed && j === count - 1;
    const c1: readonly [number, number] = startFlat || ra === 0 ? [0, 0] : ha;
    const c2: readonly [number, number] = endFlat || rb === 0 ? [dx, dy] : [dx - hb[0], dy - hb[1]];
    d += mirrored && ra !== 0 ? `s${w(c2[0])},${w(c2[1])} ${w(dx)},${w(dy)}` : `c${w(c1[0])},${w(c1[1])} ${w(c2[0])},${w(c2[1])} ${w(dx)},${w(dy)}`;
    // The next step can omit its first handle if this one ended on a smooth point's handle.
    mirrored = !(endFlat || rb === 0);
  }
  return closed ? `${d}z` : d;
}

/** The knots reflected across x = `axis`, in reverse order so the outline still runs the same way round. */
export function mirror(knots: readonly Knot[], axis: number): Knot[] {
  return knots.map((k) => [2 * axis - k[0], k[1], k[2] ?? 1] as const).reverse();
}

/** A shape symmetric about x = `axis` from one half: `half` runs from a point on the axis down one side to another on the axis. */
export function symmetric(half: readonly Knot[], axis: number): Knot[] {
  const other = half.slice(1, -1).map((k) => [2 * axis - k[0], k[1], k[2] ?? 1] as const);
  return [...half, ...other.reverse()];
}

/**
 * A stroke that swells and tapers (a brow, a lash line, a strand of hair) as a filled outline: `spine` is its middle and
 * `widths` its width at each point (0 makes a point). Filled, so its ends can be fine and its middle full, like a brush.
 */
export function taper(spine: readonly Pt[], widths: readonly number[]): string {
  const left: Knot[] = [];
  const right: Knot[] = [];
  const last = spine.length - 1;
  spine.forEach((p, i) => {
    const a = spine[Math.max(0, i - 1)] as Pt;
    const b = spine[Math.min(last, i + 1)] as Pt;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const half = (widths[i] ?? 0) / 2;
    const end = i === 0 || i === last;
    if (half <= 0) {
      left.push([p[0], p[1], 0]);
      return;
    }
    left.push([p[0] + nx * half, p[1] + ny * half, end ? 0.4 : 1]);
    right.push([p[0] - nx * half, p[1] - ny * half, end ? 0.4 : 1]);
  });
  return curve([...left, ...right.reverse()]);
}

/** An ellipse as path data, for shapes made of several ellipses in one path. */
export function oval(cx: number, cy: number, rx: number, ry = rx): string {
  return `M${n(cx - rx)},${n(cy)}a${n(rx)},${n(ry)} 0 1 0 ${n(2 * rx)},0a${n(rx)},${n(ry)} 0 1 0 ${n(-2 * rx)},0z`;
}

/** A filled path; `extra` is any further attributes, written as they are. */
export const fill = (d: string, colour: string, extra = ''): string => `<path d="${d}" fill="${colour}"${extra}/>`;

/** A path drawn as a line with round ends. */
export const line = (d: string, colour: string, width: number, extra = ''): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(width)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

export const ellipse = (cx: number, cy: number, rx: number, ry: number, colour: string, extra = ''): string =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${colour}"${extra}/>`;

export const circle = (cx: number, cy: number, r: number, colour: string, extra = ''): string =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colour}"${extra}/>`;

/** Beads along a line as a dotted stroke, round dots `size` across every `gap`: one short path instead of a circle per bead. */
export const beadsAlong = (d: string, colour: string, size: number, gap: number): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(size)}" stroke-linecap="round" stroke-dasharray="0 ${n2(gap)}"/>`;

/** An opacity attribute, for the few shapes that are a veil of shade or light. */
export const alpha = (a: number): string => ` fill-opacity="${n2(a)}"`;

/** A part of a character: the gradients and clips it uses, then its shapes. */
export function part(defs: readonly string[], shapes: readonly string[]): string {
  return (defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '') + shapes.join('');
}

/** A clip path around `d`, for the teeth and tongue inside a mouth and an eye inside its lids. */
export const clipDef = (id: string, d: string): string => `<clipPath id="${id}"><path d="${d}"/></clipPath>`;

/** Shapes kept inside a clip path. */
export const clipped = (id: string, inner: string): string => `<g clip-path="url(#${id})">${inner}</g>`;
