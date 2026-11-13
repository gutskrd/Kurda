/**
 * The streak's medals: what a kept streak is handed, and the small ones the
 * days of its week wear.
 *
 * The medal is a soft pentagon of the sun's gold with a laurel pressed into
 * it — the oldest sign there is for "you kept at it", and one that says so
 * with no word and no number, so it is the same medal on the third day and
 * the three-hundredth. A day's medal is the same piece small and round: gold
 * with the laurel for a day learned, ice blue with a snowflake for a day a
 * freeze kept.
 *
 * Made the way a badge is (badges.ts): one colour modelled in a few soft
 * steps, lit from the upper left, with its thickness under it. No tag and no
 * plate: at the size a day's medal is drawn there is room for one thing.
 */
import { BADGE_GLYPHS, GLYPH_VIEWBOX } from './badge-glyphs.js';
import { regular, roundPath } from './geometry.js';
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

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * A laurel: two branches rising from the foot of a circle up its sides,
 * leaves in pairs, one leaning out and a shorter one leaning in, smaller
 * toward the tips, which stop short of meeting. Returns the leaves as one
 * path and the two stems as another.
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
      // the way the branch grows there, and the way out from the circle
      const grow: Pt = [side * Math.sin(a), -Math.cos(a)];
      const out: Pt = [side * Math.cos(a), Math.sin(a)];
      const lean = (by: number): Pt => [grow[0] * Math.cos(rad(by)) + out[0] * Math.sin(rad(by)), grow[1] * Math.cos(rad(by)) + out[1] * Math.sin(rad(by))];
      const taper = 1 - 0.34 * t;
      leaves.push(leaf(at(deg), lean(46), len * taper, width * taper));
      if (k < pairs - 1) leaves.push(leaf(at(deg - 8), lean(-40), len * 0.72 * taper, width * 0.86 * taper));
    }
    // the last leaf carries on the way the branch was going
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
  /** pixels; default 96 */
  size?: number;
  /** the medal before it is lit: yesterday's, in greys (the streak's card opens on it, under the gold one) */
  unlit?: boolean;
  /** the accessible label */
  title?: string;
  idPrefix?: string;
}

/**
 * The streak's medal: a soft pentagon of gold with a laurel pressed into it,
 * and a soft shadow under it. `unlit` is the same medal before today's
 * lesson lit it, in greys, the same shapes at the same places, so that one
 * laid over the other is one medal changing colour.
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

/**
 * A day's medal in the streak's week: small and round, gold with the laurel
 * for a day learned, ice blue with a snowflake for a day a freeze kept. It is
 * drawn to be read at the size of a fingertip, so it has no shadow and its
 * sign is large.
 */
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
    // winter's own glyph, the one its badge shows
    const box = 76;
    const k = box / GLYPH_VIEWBOX;
    const d = (BADGE_GLYPHS.zivistan ?? []).join('');
    dr.add(pressed(dr, tone, 0, GLYPH_VIEWBOX, (fill, _stroke, dy) => `<path d="${d}" transform="translate(${n(60 - box / 2)} ${n(cy - box / 2 + dy)}) scale(${n2(k)})" fill="${fill}"/>`));
  }
  return dr.svg(size, opts.title ?? (kind === 'learned' ? 'Day learned' : 'Day kept by a freeze'));
}
