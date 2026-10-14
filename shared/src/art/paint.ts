/**
 * How metal, ink and light are put down, shared by the badges, emblems and
 * frames so they are lit the same way: light from the upper left, an ink
 * outline of one weight, a bright bevel on the top edge of anything raised.
 */
import { circ } from './icons.js';
import type { Metal } from './palette.js';
import { INK } from './palette.js';
import type { Drawing, Pt } from './svg.js';
import { linearAt, linearBox, n, n2, polyPath } from './svg.js';

/** The width of the ink outline around every raised piece, on the 120 canvas. */
export const OUTLINE = 2.4;

/** A metal lit from the upper left across the box x1,y1 → x2,y2. Returns the gradient's id. */
export function metalAcross(dr: Drawing, m: Metal, x1: number, y1: number, x2: number, y2: number): string {
  const id = dr.id('m');
  dr.def(
    linearAt(
      id,
      [
        [0, m.hi],
        [0.28, m.light],
        [0.62, m.mid],
        [1, m.dark],
      ],
      x1,
      y1,
      x2,
      y2,
    ),
  );
  return id;
}

/** A metal lit from above over each shape's own box. */
export function metalBox(dr: Drawing, m: Metal): string {
  const id = dr.id('b');
  dr.def(
    linearBox(id, [
      [0, m.hi],
      [0.45, m.light],
      [1, m.mid],
    ]),
  );
  return id;
}

/** A darker metal lit from above over each shape's own box. */
export function metalBoxDark(dr: Drawing, m: Metal): string {
  const id = dr.id('b');
  dr.def(
    linearBox(id, [
      [0, m.mid],
      [1, m.dark],
    ]),
  );
  return id;
}

/** A shape with an ink edge: the ink drawn under at twice the width, so the fill keeps its full size. */
export function inked(d: string, fill: string, width = OUTLINE, extra = ''): string {
  return `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${n2(width)}" stroke-linejoin="round"${extra}/>`;
}

/** A ring between two radii, as one even-odd path. */
export function ring(cx: number, cy: number, outer: number, inner: number): string {
  return `${circ(cx, cy, outer)}${circ(cx, cy, inner)}`;
}

/** An outline and the same outline moved in, as one even-odd path: a band. */
export function band(outer: readonly Pt[], inner: readonly Pt[]): string {
  return `${polyPath(outer)}${polyPath(inner)}`;
}

/** A soft shadow under a piece: its outline, dropped and darkened. No blur — a blur is where renderers disagree. */
export function dropShadow(d: string, dy = 2.6, opacity = 0.26): string {
  return `<path d="${d}" fill="#000000" fill-opacity="${n2(opacity)}" transform="translate(0 ${n(dy)})"/>`;
}

/** A bright edge along the top of a piece: a stroke that fades out toward the bottom. */
export function bevel(dr: Drawing, d: string, top: number, bottom: number, width = 1.3, opacity = 0.75): string {
  const id = dr.id('v');
  dr.def(
    linearAt(
      id,
      [
        [0, '#ffffff', opacity],
        [0.5, '#ffffff', opacity * 0.25],
        [1, '#ffffff', 0],
      ],
      0,
      top,
      0,
      bottom,
    ),
  );
  return `<path d="${d}" fill="none" stroke="url(#${id})" stroke-width="${n2(width)}" stroke-linejoin="round"/>`;
}

/** A small diamond, the kilim's commonest mark. */
export function diamondAt(cx: number, cy: number, w: number, h: number, deg = 0): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = (x: number, y: number): string => `${n(cx + x * c - y * s)},${n(cy + x * s + y * c)}`;
  return `M${p(0, -h / 2)}L${p(w / 2, 0)} ${p(0, h / 2)} ${p(-w / 2, 0)}Z`;
}

/** Roman numerals I, II, III as serifed bars, centred on cx,cy; `h` is their height. */
export function numeral(count: number, cx: number, cy: number, h: number): string {
  const bar = h * 0.32;
  const serif = h * 0.66;
  const st = h * 0.17;
  const gap = serif + h * 0.1;
  const x0 = cx - ((count - 1) * gap) / 2;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + i * gap;
    const t = cy - h / 2;
    const b = cy + h / 2;
    out.push(
      `M${n(x - serif / 2)},${n(t)}H${n(x + serif / 2)}V${n(t + st)}H${n(x + bar / 2)}V${n(b - st)}H${n(x + serif / 2)}V${n(b)}` +
        `H${n(x - serif / 2)}V${n(b - st)}H${n(x - bar / 2)}V${n(t + st)}H${n(x - serif / 2)}Z`,
    );
  }
  return out.join('');
}
