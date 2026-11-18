/**
 * Chunky round figures for a badge's milestone ("7", "100"). Drawings carry no text, since fonts differ between
 * renderers, so each figure is a centre line stroked with a thick round pen three times: a dark edge, the edge again
 * lower for thickness, and the face. Each figure's box is one unit tall and as wide as the figure needs.
 */
import type { Drawing } from './svg.js';
import { linearAt, n, n2 } from './svg.js';

type Cmd = readonly ['M' | 'L', number, number] | readonly ['C', number, number, number, number, number, number] | readonly ['Z'];

interface Figure {
  w: number;
  path: readonly Cmd[];
}

const FIGURES: Record<string, Figure> = {
  '0': {
    w: 0.62,
    path: [['M', 0.31, 0], ['C', 0.54, 0, 0.62, 0.24, 0.62, 0.5], ['C', 0.62, 0.76, 0.54, 1, 0.31, 1], ['C', 0.08, 1, 0, 0.76, 0, 0.5], ['C', 0, 0.24, 0.08, 0, 0.31, 0], ['Z']],
  },
  '1': { w: 0.24, path: [['M', 0, 0.2], ['L', 0.24, 0], ['L', 0.24, 1]] },
  '2': {
    w: 0.6,
    path: [['M', 0.02, 0.22], ['C', 0.08, 0.06, 0.2, 0, 0.31, 0], ['C', 0.48, 0, 0.58, 0.11, 0.58, 0.27], ['C', 0.58, 0.45, 0.42, 0.58, 0.26, 0.72], ['L', 0, 1], ['L', 0.6, 1]],
  },
  '3': {
    w: 0.6,
    path: [
      ['M', 0.02, 0.1],
      ['C', 0.12, 0.03, 0.21, 0, 0.3, 0],
      ['C', 0.47, 0, 0.57, 0.1, 0.57, 0.25],
      ['C', 0.57, 0.4, 0.45, 0.48, 0.26, 0.48],
      ['C', 0.47, 0.48, 0.6, 0.58, 0.6, 0.74],
      ['C', 0.6, 0.9, 0.46, 1, 0.3, 1],
      ['C', 0.19, 1, 0.08, 0.96, 0, 0.88],
    ],
  },
  '4': { w: 0.62, path: [['M', 0.44, 1], ['L', 0.44, 0], ['L', 0, 0.68], ['L', 0.62, 0.68]] },
  '5': {
    w: 0.6,
    path: [['M', 0.56, 0], ['L', 0.08, 0], ['L', 0.04, 0.44], ['C', 0.14, 0.38, 0.24, 0.36, 0.32, 0.36], ['C', 0.48, 0.36, 0.6, 0.48, 0.6, 0.67], ['C', 0.6, 0.87, 0.46, 1, 0.28, 1], ['C', 0.16, 1, 0.06, 0.95, 0, 0.87]],
  },
  '6': {
    w: 0.6,
    path: [['M', 0.5, 0.02], ['C', 0.2, 0.06, 0.02, 0.3, 0.02, 0.62], ['C', 0.02, 0.84, 0.14, 1, 0.31, 1], ['C', 0.48, 1, 0.6, 0.86, 0.6, 0.68], ['C', 0.6, 0.5, 0.48, 0.38, 0.32, 0.38], ['C', 0.18, 0.38, 0.06, 0.46, 0.02, 0.6]],
  },
  '7': { w: 0.58, path: [['M', 0, 0], ['L', 0.58, 0], ['L', 0.2, 1]] },
  '8': {
    w: 0.58,
    path: [
      ['M', 0.29, 0.46],
      ['C', 0.12, 0.46, 0.04, 0.36, 0.04, 0.23],
      ['C', 0.04, 0.09, 0.15, 0, 0.29, 0],
      ['C', 0.43, 0, 0.54, 0.09, 0.54, 0.23],
      ['C', 0.54, 0.36, 0.46, 0.46, 0.29, 0.46],
      ['C', 0.1, 0.46, 0, 0.58, 0, 0.73],
      ['C', 0, 0.89, 0.13, 1, 0.29, 1],
      ['C', 0.45, 1, 0.58, 0.89, 0.58, 0.73],
      ['C', 0.58, 0.58, 0.48, 0.46, 0.29, 0.46],
      ['Z'],
    ],
  },
  '9': {
    w: 0.6,
    path: [['M', 0.1, 0.98], ['C', 0.4, 0.94, 0.58, 0.7, 0.58, 0.38], ['C', 0.58, 0.16, 0.46, 0, 0.29, 0], ['C', 0.12, 0, 0, 0.14, 0, 0.32], ['C', 0, 0.5, 0.12, 0.62, 0.28, 0.62], ['C', 0.42, 0.62, 0.54, 0.54, 0.58, 0.4]],
  },
};

/** How thick the pen is, and the room between figures, as shares of the height. */
const PEN = 0.27;
const GAP = 0.05;

/** The figures of `text`; anything that is not a digit is skipped. */
const figuresOf = (text: string): Figure[] => [...text].map((ch) => FIGURES[ch]).filter((f): f is Figure => f !== undefined);

/** How wide a number is, pen and all, as a share of its height. */
export function numeralWidth(text: string): number {
  const figs = figuresOf(text);
  if (figs.length === 0) return 0;
  return figs.reduce((sum, f) => sum + f.w + PEN, 0) + GAP * (figs.length - 1);
}

/** The centre line of a number `h` tall, centred on cx, its top at y. */
function centreLine(text: string, cx: number, y: number, h: number): string {
  const figs = figuresOf(text);
  let x = cx - (numeralWidth(text) * h) / 2 + (PEN * h) / 2;
  const out: string[] = [];
  for (const f of figs) {
    const P = (u: number, v: number): string => `${n(x + u * h)},${n(y + v * h)}`;
    for (const c of f.path) {
      if (c[0] === 'Z') out.push('Z');
      else if (c[0] === 'C') out.push(`C${P(c[1], c[2])} ${P(c[3], c[4])} ${P(c[5], c[6])}`);
      else out.push(`${c[0]}${P(c[1], c[2])}`);
    }
    x += (f.w + PEN + GAP) * h;
  }
  return out.join('');
}

export interface NumeralStyle {
  /** The edge round the figures and the thickness under them. */
  edge: string;
  /** The face, top to bottom. */
  top: string;
  bottom: string;
  /** The edge width and how far its copy drops, as shares of the height. */
  rim?: number;
  drop?: number;
}

/** A number `h` tall, centred on cx with its top at y: a dark edge with its thickness below, and a face lit from above. */
export function numeral(dr: Drawing, text: string, cx: number, y: number, h: number, style: NumeralStyle): string {
  const d = centreLine(text, cx, y, h);
  if (!d) return '';
  const face = dr.id('nf');
  dr.def(linearAt(face, [[0, style.top], [0.55, style.top], [1, style.bottom]], 0, y - PEN * h * 0.5, 0, y + h + PEN * h * 0.5));
  const pen = PEN * h;
  const rim = h * (style.rim ?? 0.11);
  const line = (extra: string): string => `<path d="${d}" fill="none" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  return (
    line(` transform="translate(0 ${n2(h * (style.drop ?? 0.09))})" stroke="${style.edge}" stroke-width="${n2(pen + rim * 2)}"`) +
    line(` stroke="${style.edge}" stroke-width="${n2(pen + rim * 2)}"`) +
    line(` stroke="url(#${face})" stroke-width="${n2(pen)}"`)
  );
}
