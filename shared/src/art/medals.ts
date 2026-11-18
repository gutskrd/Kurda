/**
 * The streak medals: the medal a kept streak earns, and the small ones on the days of its week. The streak medal is a
 * soft gold pentagon with a pressed laurel, with no number, so it is the same on day three and day three hundred. A
 * day's medal is small and round: gold with the laurel for a day learned, ice blue with a snowflake for a frozen day.
 * Modelled like a badge (badges.ts), but with no tag or plate.
 */
import { BADGE_GLYPHS, GLYPH_VIEWBOX } from './badge-glyphs.js';
import { rad, regular, roundPath } from './geometry.js';
import { circ } from './icons.js';
import { leaf } from './paint.js';
import type { Pt } from './svg.js';
import { Drawing, checkSize, linearAt, n, n2, prefixFor, radialBox } from './svg.js';

/** One colour in the steps a medal is modelled in, and the ink its sign is pressed in. */
interface MedalTone {
  light: string;
  mid: string;
  dark: string;
  deep: string;
  ink: readonly [string, string];
}

const GOLD: MedalTone = { light: '#ffe596', mid: '#f8c84c', dark: '#eeb02c', deep: '#c98a14', ink: ['#b8801a', '#8f5d08'] };
/** The medal before it is lit: the same piece in the greys a badge not yet earned is drawn in. */
const UNLIT: MedalTone = { light: '#dfe2e8', mid: '#c3c8d2', dark: '#a9b0bc', deep: '#8f96a4', ink: ['#8a91a0', '#6c7383'] };
const ICE: MedalTone = { light: '#d6eeff', mid: '#9fd2f8', dark: '#6fb6ec', deep: '#3f8fd0', ink: ['#3d86c4', '#235f9a'] };

/**
 * A laurel: two branches up the sides of a circle, leaves in pairs (one leaning out, a shorter one in) shrinking toward
 * tips that stop short of meeting. Returns the leaves and the two stems as separate paths.
 */
function laurel(cx: number, cy: number, r: number, len: number, width: number): { leaves: string; stems: string } {
  const pairs = 5;
  const from = 74;
  const to = -52;
  const leaves: string[] = [];
  const stems: string[] = [];
  for (const side of [1, -1] as const) {
    const at = (deg: number): Pt => [cx + side * Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r];
    for (let k = 0; k < pairs; k++) {
      const t = k / (pairs - 1);
      const deg = from + (to - from) * t;
      const a = rad(deg);
      // The branch's direction at this point, and the outward direction from the circle.
      const grow: Pt = [side * Math.sin(a), -Math.cos(a)];
      const out: Pt = [side * Math.cos(a), Math.sin(a)];
      const lean = (by: number): Pt => [grow[0] * Math.cos(rad(by)) + out[0] * Math.sin(rad(by)), grow[1] * Math.cos(rad(by)) + out[1] * Math.sin(rad(by))];
      const taper = 1 - 0.34 * t;
      leaves.push(leaf(at(deg), lean(46), len * taper, width * taper));
      if (k < pairs - 1) leaves.push(leaf(at(deg - 8), lean(-40), len * 0.72 * taper, width * 0.86 * taper));
    }
    // The last leaf continues the branch's direction.
    const tip = rad(to);
    leaves.push(leaf(at(to - 6), [side * Math.sin(tip), -Math.cos(tip)], len * 0.62, width * 0.62));
    const [x0, y0] = at(from + 14);
    const [x1, y1] = at(to - 4);
    stems.push(`M${n(x0)},${n(y0)}A${n(r)},${n(r)} 0 0 ${side === 1 ? 0 : 1} ${n(x1)},${n(y1)}`);
  }
  return { leaves: leaves.join(''), stems: stems.join('') };
}

/** The piece: its thickness, its face lit from the upper left, the gloss on it and the light along its upper edge. */
function piece(dr: Drawing, face: string, under: string, inner: string, t: MedalTone, cy: number, r: number): string {
  const fill = dr.id('f');
  dr.def(linearAt(fill, [[0, t.light], [0.5, t.mid], [1, t.dark]], 60 - r * 0.8, cy - r, 60 + r * 0.75, cy + r));
  const gloss = dr.id('g');
  dr.def(radialBox(gloss, [[0, '#ffffff', 0.5], [1, '#ffffff', 0]], 0.28, 0.14, 0.62));
  const edge = dr.id('e');
  dr.def(linearAt(edge, [[0, '#ffffff', 0.85], [0.45, '#ffffff', 0.12], [1, t.deep, 0.3]], 0, cy - r, 0, cy + r));
  return (
    `<path d="${under}" fill="${t.deep}"/>` +
    `<path d="${face}" fill="url(#${fill})"/>` +
    `<path d="${face}" fill="url(#${gloss})"/>` +
    `<path d="${inner}" fill="none" stroke="url(#${edge})" stroke-width="1.8"/>`
  );
}

/** A sign pressed into the piece: a line of light along its lower edge, then the sign in the piece's own darker ink. */
function pressed(dr: Drawing, t: MedalTone, top: number, bottom: number, draw: (fill: string, stroke: string, dy: number) => string): string {
  const ink = dr.id('i');
  dr.def(linearAt(ink, [[0, t.ink[0]], [1, t.ink[1]]], 0, top, 0, bottom));
  return draw('#ffffff', '#ffffff', 1.2).replace(/<path /g, '<path opacity="0.7" ') + draw(`url(#${ink})`, `url(#${ink})`, 0);
}

export interface MedalOptions {
  /** Size in pixels; defaults to 96. */
  size?: number;
  /** Yesterday's medal in greys; the streak card opens on it, under the gold one. */
  unlit?: boolean;
  /** The accessible label. */
  title?: string;
  idPrefix?: string;
}

/**
 * The streak medal: a gold pentagon with a pressed laurel and a soft shadow. `unlit` draws the same shapes in greys at
 * the same places, so one laid over the other reads as a single medal changing colour.
 */
export function streakMedalSvg(opts: MedalOptions = {}): string {
  const size = checkSize(opts.size, 96);
  const tone = opts.unlit ? UNLIT : GOLD;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'streak-medal', opts.unlit === true));
  const cy = 55;
  const r = 52;
  const corners = regular(60, cy, r, 5, -90);
  const face = roundPath(corners, 15);
  const under = roundPath(regular(60, cy + 5, r, 5, -90), 15);
  const inner = roundPath(regular(60, cy, r - 1.1, 5, -90), 14);
  const shadow = dr.id('s');
  dr.def(radialBox(shadow, [[0, '#000000', 0.22], [1, '#000000', 0]]));
  dr.add(`<ellipse cx="60" cy="112" rx="36" ry="5.5" fill="url(#${shadow})"/>`);
  dr.add(piece(dr, face, under, inner, tone, cy, r));
  const sign = laurel(60, cy + 3, 19.5, 13.5, 4.3);
  dr.add(
    pressed(dr, tone, cy - 22, cy + 26, (fill, stroke, dy) => {
      const move = dy === 0 ? '' : ` transform="translate(0 ${n2(dy)})"`;
      return `<path d="${sign.stems}"${move} fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/><path d="${sign.leaves}"${move} fill="${fill}"/>`;
    }),
  );
  return dr.svg(size, opts.title ?? 'Streak');
}

export type DayMedal = 'learned' | 'frozen';

/** A day's medal in the streak week, read at fingertip size: no shadow and a large sign. */
export function dayMedalSvg(opts: MedalOptions & { kind: DayMedal }): string {
  const { kind } = opts;
  if (kind !== 'learned' && kind !== 'frozen') throw new RangeError(`art: unknown day medal ${String(kind)}`);
  const size = checkSize(opts.size, 36);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'day-medal', kind));
  const tone = kind === 'learned' ? GOLD : ICE;
  const cy = 57;
  const r = 54;
  dr.add(piece(dr, circ(60, cy, r), circ(60, cy + 5, r), circ(60, cy, r - 1.2), tone, cy, r));
  if (kind === 'learned') {
    const sign = laurel(60, cy + 3, 24, 17, 5.6);
    dr.add(
      pressed(dr, tone, cy - 28, cy + 32, (fill, stroke, dy) => {
        const move = dy === 0 ? '' : ` transform="translate(0 ${n2(dy)})"`;
        return `<path d="${sign.stems}"${move} fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round"/><path d="${sign.leaves}"${move} fill="${fill}"/>`;
      }),
    );
  } else {
    // Winter's glyph, the one its badge shows.
    const box = 76;
    const k = box / GLYPH_VIEWBOX;
    const d = (BADGE_GLYPHS.zivistan ?? []).join('');
    dr.add(pressed(dr, tone, 0, GLYPH_VIEWBOX, (fill, _stroke, dy) => `<path d="${d}" transform="translate(${n(60 - box / 2)} ${n(cy - box / 2 + dy)}) scale(${n2(k)})" fill="${fill}"/>`));
  }
  return dr.svg(size, opts.title ?? (kind === 'learned' ? 'Day learned' : 'Day kept by a freeze'));
}
