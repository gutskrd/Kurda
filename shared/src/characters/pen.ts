/**
 * The pen the characters are drawn with.
 *
 * A figure is mostly soft outlines: a sleeve, a lock of hair, a cheek. Each is
 * set down as the few points an illustrator would place, and a smooth curve is
 * run through them; a point can be marked as a corner, or as a tighter or
 * looser bend. The curve leaves each point along the line that halves the
 * angle there and reaches a third of the way toward the next point, so it
 * never bulges far past where it was put, even when the points are unevenly
 * spaced.
 *
 * Points are rounded to a tenth before anything is measured from them, and a
 * path is written as steps from one rounded point to the next: short, exact,
 * and the same string on every machine, as `art/svg.ts` asks of every drawing.
 */
import type { Pt } from '../art/svg.js';
import { n, n2 } from '../art/svg.js';

/** A point on an outline: x, y and how round the curve runs through it (1 by default, 0 for a corner). */
export type Knot = readonly [number, number] | readonly [number, number, number];

const tenths = (v: number): number => Math.round(v * 10);
/** A whole number of tenths, as written into a path. */
const w = (t: number): string => n(t / 10);

/**
 * A smooth path through `knots`: closed into a loop unless `closed` is false.
 *
 * Each point's two handles are the same length, a third of the shorter of
 * its two neighbouring sides (or of the average, when the sides are close),
 * so the curve passes through it the same way it arrives; that also lets
 * every segment after a smooth point be written with the short `s` step,
 * which leaves out the handle the reader can work out by reflection.
 * Written with relative steps, so a small shape far from the origin still
 * costs only a few characters a point.
 */
export function curve(knots: readonly Knot[], closed = true): string {
  const count = knots.length;
  if (count === 0) return '';
  const pts = knots.map((k) => [tenths(k[0]), tenths(k[1])] as const);
  const round = knots.map((k) => k[2] ?? 1);
  const at = (i: number): readonly [number, number] =>
    pts[closed ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i))] as readonly [number, number];
  // each point's handle, in whole tenths: along the line halfway between the way in and the way out
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
  // whether the previous step was a curve whose last handle mirrors this point's out-handle
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
    // an open curve's ends have no way in or out to share, so their handles are flat
    const startFlat = !closed && i === 0;
    const endFlat = !closed && j === count - 1;
    const c1: readonly [number, number] = startFlat || ra === 0 ? [0, 0] : ha;
    const c2: readonly [number, number] = endFlat || rb === 0 ? [dx, dy] : [dx - hb[0], dy - hb[1]];
    d += mirrored && ra !== 0 ? `s${w(c2[0])},${w(c2[1])} ${w(dx)},${w(dy)}` : `c${w(c1[0])},${w(c1[1])} ${w(c2[0])},${w(c2[1])} ${w(dx)},${w(dy)}`;
    // the next step can leave its first handle out if this one ended on a smooth point's handle
    mirrored = !(endFlat || rb === 0);
  }
  return closed ? `${d}z` : d;
}

/** The same knots reflected across the upright line x = `axis`, in the opposite order so the outline still runs the same way round. */
export function mirror(knots: readonly Knot[], axis: number): Knot[] {
  return knots.map((k) => [2 * axis - k[0], k[1], k[2] ?? 1] as const).reverse();
}

/**
 * A shape the same on both sides of x = `axis`, from one half of it: `half`
 * runs from a point on the axis, down one side, to another point on the axis.
 */
export function symmetric(half: readonly Knot[], axis: number): Knot[] {
  const other = half.slice(1, -1).map((k) => [2 * axis - k[0], k[1], k[2] ?? 1] as const);
  return [...half, ...other.reverse()];
}

/**
 * A stroke that swells and tapers — an eyebrow, a lash line, a strand of hair
 * — as a filled outline: `spine` is its middle and `widths` how wide it is at
 * each point (0 makes a point). Filled rather than stroked, so its ends can be
 * fine and its middle full, as a brush leaves it.
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

/** An ellipse as path data, for shapes that are several ellipses in one path. */
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

/**
 * Beads along a line: a dotted stroke, round dots `size` across every `gap`.
 * One short path however many beads there are, where drawing each bead
 * would cost a circle apiece.
 */
export const beadsAlong = (d: string, colour: string, size: number, gap: number): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(size)}" stroke-linecap="round" stroke-dasharray="0 ${n2(gap)}"/>`;

/** An opacity attribute, for the few shapes that are a veil of shade or light. */
export const alpha = (a: number): string => ` fill-opacity="${n2(a)}"`;

/** A part of a character: the gradients and clips it uses, then its shapes. */
export function part(defs: readonly string[], shapes: readonly string[]): string {
  return (defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '') + shapes.join('');
}

/** A clip path around `d`, for the teeth and tongue inside a mouth and the eye inside its lids. */
export const clipDef = (id: string, d: string): string => `<clipPath id="${id}"><path d="${d}"/></clipPath>`;

/** Shapes kept inside a clip path. */
export const clipped = (id: string, inner: string): string => `<g clip-path="url(#${id})">${inner}</g>`;
