/**
 * The pen the whole pictures are drawn with (pictures.ts, props/): gradients
 * that each picture asks for in its own colours, and the few shapes every
 * picture is made of — an ellipse, a glint of light, a filled path, a line.
 *
 * A picture is drawn in the icons' 40-unit box centred on 0,0 and placed by
 * whoever draws it. Its `fine` details — fur, whiskers, ripples, glints — are
 * left out where it is small, and where it is smallest (`tiny`) only its
 * shapes and colours are left. Not yet earned, it is the same picture with
 * every colour taken to the stone's grey.
 */
import { circ } from './icons.js';
import type { Stop } from './svg.js';
import { Drawing, grey, linearAt, linearBox, mix, n, radialAt, radialBox } from './svg.js';

export interface Pen {
  /** large: every detail */
  readonly fine: boolean;
  /** under 32 pixels: the shapes and their colours, and nothing finer */
  readonly tiny: boolean;
  /** a gradient along a line, in the picture's own units */
  line(stops: readonly Stop[], x1: number, y1: number, x2: number, y2: number): string;
  /** a gradient across each shape's own box: from its upper left to its lower right unless told otherwise */
  box(stops: readonly Stop[], x1?: number, y1?: number, x2?: number, y2?: number): string;
  /** a round gradient, in the picture's own units */
  round(stops: readonly Stop[], cx: number, cy: number, r: number): string;
  /** a round gradient in each shape's own box */
  roundBox(stops: readonly Stop[], cx?: number, cy?: number, r?: number): string;
}

export type Picture = (pen: Pen) => string;

/** A circle as a path, a colour mixed toward another, a number written short: the drawings' own. */
export { circ, mix, n };

/** An ellipse as a path. */
export const ell = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)},${n(cy)}A${n(rx)},${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)}A${n(rx)},${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)}Z`;

/** A four-point glint. */
export const glint = (cx: number, cy: number, r: number): string => {
  const s = r * 0.22;
  return `M${n(cx)},${n(cy - r)}Q${n(cx + s)},${n(cy - s)} ${n(cx + r)},${n(cy)}Q${n(cx + s)},${n(cy + s)} ${n(cx)},${n(cy + r)}Q${n(cx - s)},${n(cy + s)} ${n(cx - r)},${n(cy)}Q${n(cx - s)},${n(cy - s)} ${n(cx)},${n(cy - r)}Z`;
};

/**
 * A smooth curve through the points, from the first (where the pen already is)
 * to the last: each bend eased by its neighbours (Catmull-Rom, as cubic curves).
 */
export function through(pts: readonly [number, number][]): string {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)]!, pts[i]!, pts[i + 1]!, pts[Math.min(pts.length - 1, i + 2)]!];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n(c1[0]!)},${n(c1[1]!)} ${n(c2[0]!)},${n(c2[1]!)} ${n(p2[0])},${n(p2[1])}`;
  }
  return d;
}

export const path = (d: string, fill: string, more = ''): string => `<path d="${d}" fill="${fill}"${more}/>`;
export const stroke = (colour: string, width: number, more = ''): string =>
  ` stroke="${colour}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${more}`;
export const line = (d: string, colour: string, width: number, more = ''): string => `<path d="${d}" fill="none"${stroke(colour, width, more)}/>`;

export interface PictureOptions {
  dr: Drawing;
  /** 0 every detail · 1 small · 2 the smallest */
  detail: 0 | 1 | 2;
  /** not yet earned: the same picture in quiet greys */
  locked?: boolean;
}

/** Draws a picture in its 40-unit box, about 0,0; a caller places it with a transform. */
export function drawPicture(picture: Picture, { dr, detail, locked = false }: PictureOptions): string {
  const pen: Pen = {
    fine: detail === 0,
    tiny: detail === 2,
    line: (stops, x1, y1, x2, y2) => {
      const id = dr.id('penl');
      dr.def(linearAt(id, stops, x1, y1, x2, y2));
      return `url(#${id})`;
    },
    box: (stops, x1 = 0.2, y1 = 0, x2 = 0.8, y2 = 1) => {
      const id = dr.id('penb');
      dr.def(linearBox(id, stops, x1, y1, x2, y2));
      return `url(#${id})`;
    },
    round: (stops, cx, cy, r) => {
      const id = dr.id('penr');
      dr.def(radialAt(id, stops, cx, cy, r));
      return `url(#${id})`;
    },
    roundBox: (stops, cx, cy, r) => {
      const id = dr.id('peno');
      dr.def(radialBox(id, stops, cx, cy, r));
      return `url(#${id})`;
    },
  };
  if (!locked) return picture(pen);
  // not yet earned: every colour taken toward the stone's grey, its gradients' too
  const greyed = (markup: string): string => markup.replace(/#[0-9a-f]{6}\b/gi, (hex) => mix(grey(hex), '#c3c7cf', 0.3));
  const grey$ = (stops: readonly Stop[]): Stop[] => stops.map(([o, c, a]) => [o, greyed(c), a] as const);
  return greyed(
    picture({
      ...pen,
      line: (stops, x1, y1, x2, y2) => pen.line(grey$(stops), x1, y1, x2, y2),
      box: (stops, x1, y1, x2, y2) => pen.box(grey$(stops), x1, y1, x2, y2),
      round: (stops, cx, cy, r) => pen.round(grey$(stops), cx, cy, r),
      roundBox: (stops, cx, cy, r) => pen.roundBox(grey$(stops), cx, cy, r),
    }),
  );
}
