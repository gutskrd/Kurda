/**
 * The ten mouth shapes of a person's face, seen from the front, all drawn as
 * variations of one smile.
 *
 * The smile is the face at rest: the lips parted a little over the upper
 * teeth, exactly as the character smiles. Every other shape moves the same
 * few things — how far the jaw drops, how wide the mouth pulls, how round the
 * opening is, how much of the teeth and tongue shows — from that smile, keeping
 * its lip colour and its teeth. So whichever two shapes follow each other, the
 * mouth changes and the face does not.
 *
 * Each shape is one mouth: the lips, in one colour, as a single shape that
 * hugs the opening a little way all round, and the opening laid over them with
 * the teeth and tongue kept inside it by a clip. Nothing else is drawn, so no
 * second edge can show beside the first, and one shape laid over another
 * leaves no hairline of skin between them at any size.
 */
import type { Viseme } from '../lipsync/visemes.js';
import type { Pt } from '../art/svg.js';
import { n } from '../art/svg.js';
import type { Knot } from './pen.js';
import { clipDef, clipped, curve, fill, oval, part, taper } from './pen.js';

export interface Smile {
  /** the opening at rest — the upper teeth framed by the lips: its two ends, and its top and bottom at the middle */
  open: { left: Pt; right: Pt; top: number; bottom: number };
  /** how far the lips reach beyond the opening: above it and below it at the middle, and past each end */
  upperLip: number;
  lowerLip: number;
  sideLip: number;
  /** how much the face is turned: the middle of the mouth sits this far toward the right end (0.5 is facing forward) */
  middle?: number;
  colours: { lip: string; line: string; inside: string; teeth: string; tongue: string };
}

/** How one shape differs from the smile. Lengths are in parts of the smile's half-width. */
interface Shape {
  /** the opening's width, as a part of the smile's */
  width: number;
  /** how far the corners and the top of the opening move (down is positive) */
  corner: number;
  top: number;
  /** how far below the smile's teeth the opening reaches at the middle */
  drop: number;
  /** 0 keeps the smile's shallow corners; 1 makes a round mouth */
  round: number;
  /** how much of the upper teeth shows (1 is all of it, as in the smile), and of the lower teeth */
  teeth: number;
  lower: number;
  /** how high the tongue comes (0: not seen); `tip` lifts its tip to the teeth */
  tongue: number;
  tip?: boolean;
  /** how much fuller the lips are, pushed forward round a round mouth, in the drawing's units */
  pout: number;
}

/**
 * Measured against one another so each reads at a glance even when the face
 * is a few dozen pixels tall: `a` the widest and deepest, `o` round, `u`
 * small and pushed forward, `i` spread with both rows of teeth, `etc` the
 * teeth nearly together, `l` with the tongue lifted to the teeth.
 */
const SHAPES: Record<Exclude<Viseme, 'mbp' | 'fv'>, Shape> = {
  rest: { width: 1, corner: 0, top: 0, drop: 0, round: 0, teeth: 1, lower: 0, tongue: 0, pout: 0 },
  etc: { width: 1, corner: 0, top: 0, drop: 0.16, round: 0, teeth: 1, lower: 0.13, tongue: 0, pout: 0 },
  i: { width: 1.1, corner: -0.05, top: -0.02, drop: 0.2, round: 0, teeth: 1, lower: 0.17, tongue: 0, pout: 0 },
  e: { width: 1.02, corner: 0.03, top: 0, drop: 0.48, round: 0.25, teeth: 1, lower: 0.1, tongue: 0.24, pout: 0 },
  l: { width: 0.96, corner: 0.05, top: 0, drop: 0.55, round: 0.3, teeth: 1, lower: 0, tongue: 0.6, tip: true, pout: 0 },
  a: { width: 1, corner: 0.12, top: 0, drop: 0.95, round: 0.45, teeth: 1, lower: 0, tongue: 0.34, pout: 0 },
  o: { width: 0.6, corner: 0.16, top: -0.08, drop: 0.7, round: 1, teeth: 0.5, lower: 0, tongue: 0.22, pout: 0.3 },
  u: { width: 0.38, corner: 0.12, top: 0.04, drop: 0.3, round: 1, teeth: 0, lower: 0, tongue: 0, pout: 0.6 },
};

/** The smile's measures, worked out once. */
function measures(s: Smile) {
  const { left, right, top, bottom } = s.open;
  const mid = s.middle ?? 0.5;
  const cx = left[0] + (right[0] - left[0]) * mid;
  const hw = (right[0] - left[0]) / 2;
  const endY = (left[1] + right[1]) / 2;
  return { left, right, top, bottom, mid, cx, hw, endY };
}

/** An opening as knots: its two ends, its top edge and its bottom edge. */
function opening(s: Smile, k: Shape): Knot[] {
  const m = measures(s);
  const w = m.hw * k.width;
  const lx = m.cx - w * 2 * m.mid;
  const rx = m.cx + w * 2 * (1 - m.mid);
  const ly = m.left[1] + k.corner * m.hw;
  const ry = m.right[1] + k.corner * m.hw;
  const top = m.top + k.top * m.hw;
  const bottom = m.bottom + (k.drop + k.top) * m.hw;
  const r = 0.35 + 0.65 * k.round;
  // a smile's top edge is nearly flat to its ends; a round mouth's top arches like its bottom
  const shoulder = (y: number): number => top + (y - top) * (0.12 + 0.06 * k.round);
  return [
    [lx, ly, r],
    [lx + (m.cx - lx) * 0.45, shoulder(ly)],
    [m.cx, top],
    [rx - (rx - m.cx) * 0.45, shoulder(ry)],
    [rx, ry, r],
    [rx - (rx - m.cx) * 0.42, bottom - (bottom - ry) * (0.3 - 0.12 * k.round)],
    [m.cx, bottom],
    [lx + (m.cx - lx) * 0.42, bottom - (bottom - ly) * (0.3 - 0.12 * k.round)],
  ];
}

/**
 * The lips round an opening: the opening's own outline carried out a little —
 * a thin upper lip over it, a fuller lower lip under it, and to a point just
 * past each end. The lips thin as the jaw drops and the mouth rounds, and
 * fill out where they push forward.
 */
function lips(s: Smile, k: Shape, open: readonly Knot[]): Knot[] {
  const stretch = Math.max(0.55, 1 - 0.25 * k.drop - 0.2 * k.round);
  const up = s.upperLip * stretch + k.pout;
  const down = s.lowerLip * stretch + k.pout * 1.4;
  const side = s.sideLip * (1 - 0.55 * k.round) + k.pout;
  const at = (i: number): Knot => open[i] as Knot;
  return [
    [at(0)[0] - side, at(0)[1] + 0.2, at(0)[2] ?? 1],
    [at(1)[0] - side * 0.3, at(1)[1] - up * 0.85],
    [at(2)[0], at(2)[1] - up],
    [at(3)[0] + side * 0.3, at(3)[1] - up * 0.85],
    [at(4)[0] + side, at(4)[1] + 0.2, at(4)[2] ?? 1],
    [at(5)[0] + side * 0.3, at(5)[1] + down * 0.85],
    [at(6)[0], at(6)[1] + down],
    [at(7)[0] - side * 0.3, at(7)[1] + down * 0.85],
  ];
}

/** A rectangle as path data, for what fills an opening inside its clip. */
const box = (x: number, y: number, w: number, h: number): string => `M${n(x)},${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;

function shaped(s: Smile, k: Shape, clipId: string): string {
  const m = measures(s);
  const c = s.colours;
  const open = opening(s, k);
  const hole = curve(open);
  const top = (open[2] as Knot)[1];
  const bottom = (open[6] as Knot)[1];
  const span = (open[4] as Knot)[0] - (open[0] as Knot)[0];
  const x0 = (open[0] as Knot)[0] - 2;
  const inner = [fill(box(x0, top - 2, span + 4, bottom - top + 4), c.inside)];
  if (k.tongue > 0) {
    const th = k.tongue * m.hw;
    const tw = span * 0.36;
    const tx = (open[6] as Knot)[0];
    inner.push(
      fill(
        k.tip
          ? curve([
              [tx - tw * 1.2, bottom + 3],
              [tx - tw * 0.7, bottom - th * 0.55],
              [tx, top + k.teeth * (m.bottom - m.top) * 0.8],
              [tx + tw * 0.7, bottom - th * 0.55],
              [tx + tw * 1.2, bottom + 3],
            ])
          : oval(tx, bottom + th * 0.15, tw * 1.05, th * 1.15),
        c.tongue,
      ),
    );
  }
  if (k.teeth > 0) {
    // the upper teeth are the smile's own, carried with the top of the mouth and trimmed by the opening;
    // a narrower mouth shows the middle of the same row, so they never narrow with it
    const smile = opening(s, SHAPES.rest);
    const dy = top - m.top;
    const depth = (m.bottom - m.top) * (1 - k.teeth);
    const teeth = smile.map(([x, y, r], i) => [m.cx + (x - m.cx) * Math.max(1, k.width) * 1.04, y + dy - (i >= 5 && i <= 7 ? depth : 0) + (i === 2 ? -3 : 0), r] as Knot);
    // the top of the teeth reaches up under the lip
    teeth[1] = [(teeth[1] as Knot)[0], top - 3];
    teeth[3] = [(teeth[3] as Knot)[0], top - 3];
    inner.push(fill(curve(teeth), c.teeth));
  }
  if (k.lower > 0) {
    const lh = k.lower * m.hw;
    inner.push(fill(curve(open.slice(4).concat([open[0] as Knot]).map(([x, y, r], i) => [x, i === 0 || i === 4 ? y + 3 : y - lh, r] as Knot)), c.teeth));
  }
  return part(
    [clipDef(clipId, hole)],
    [fill(curve(lips(s, k, open)), c.lip), clipped(clipId, inner.join(''))],
  );
}

/**
 * b, m, p: the lips pressed together, no teeth showing — one shape the width
 * of the smile, a little fuller than at rest, closed along its middle by a
 * single line.
 */
function pressed(s: Smile): string {
  const m = measures(s);
  const c = s.colours;
  const meet = (m.top + m.bottom) / 2 - (m.bottom - m.top) * 0.15;
  const l: Pt = [m.left[0] - s.sideLip, m.left[1] + 0.2];
  const r: Pt = [m.right[0] + s.sideLip, m.right[1] + 0.2];
  // the meeting line bows like the smile: the middle a little lower than at the ends
  const along = (t: number, dy: number): Pt => {
    const x = t < 0 ? m.cx + (m.cx - l[0]) * t : m.cx + (r[0] - m.cx) * t;
    const end = t < 0 ? l[1] : r[1];
    return [x, meet + (end - meet) * t * t + dy * (1 - t * t * 0.6)];
  };
  const up = s.upperLip + 0.3;
  const down = s.lowerLip * 0.85;
  const shape: Knot[] = [
    [l[0], l[1], 0.3],
    along(-0.5, -up),
    along(0, -up),
    along(0.5, -up),
    [r[0], r[1], 0.3],
    along(0.5, down),
    along(0, down),
    along(-0.5, down),
  ];
  const t = m.hw * 0.08;
  const seam = [along(-0.94, 0), along(-0.5, 0), along(0, 0.1), along(0.5, 0), along(0.94, 0)];
  return part([], [fill(curve(shape), c.lip), fill(taper(seam, [t * 0.3, t * 0.9, t, t * 0.9, t * 0.3]), c.line)]);
}

/**
 * f, v: the upper teeth resting on the lower lip, which is drawn up over
 * them so only their edge shows. The lower lip is the same lips' own lower
 * half, lifted, so the mouth keeps one outline.
 */
function teethOnLip(s: Smile, clipId: string): string {
  const m = measures(s);
  const c = s.colours;
  const k: Shape = { ...SHAPES.rest, width: 0.92, drop: -0.05 };
  const open = opening(s, k);
  const outline = lips(s, k, open);
  const tuck = m.top + (m.bottom - m.top) * 0.42;
  const l = open[0] as Knot;
  const r = open[4] as Knot;
  const lower: Knot[] = [
    [l[0] - 0.3, l[1] + 0.2, 0.3],
    [l[0] + (m.cx - l[0]) * 0.5, tuck + 0.15],
    [m.cx, tuck],
    [r[0] - (r[0] - m.cx) * 0.5, tuck + 0.15],
    [r[0] + 0.3, r[1] + 0.2, 0.3],
    ...outline.slice(5),
  ];
  const smile = curve(open);
  return part(
    [clipDef(clipId, smile)],
    [fill(curve(outline), c.lip), clipped(clipId, fill(box(m.left[0] - 2, m.top - 3, m.hw * 2 + 4, m.bottom - m.top + 4), c.teeth)), fill(curve(lower), c.lip)],
  );
}

/** All ten shapes for one face; `p` prefixes the clip ids so faces on one page never share one. */
export function humanMouths(s: Smile, p: string): Record<Viseme, string> {
  const id = (v: Viseme): string => `${p}m${v}`;
  return {
    rest: shaped(s, SHAPES.rest, id('rest')),
    mbp: pressed(s),
    fv: teethOnLip(s, id('fv')),
    l: shaped(s, SHAPES.l, id('l')),
    etc: shaped(s, SHAPES.etc, id('etc')),
    a: shaped(s, SHAPES.a, id('a')),
    e: shaped(s, SHAPES.e, id('e')),
    i: shaped(s, SHAPES.i, id('i')),
    o: shaped(s, SHAPES.o, id('o')),
    u: shaped(s, SHAPES.u, id('u')),
  };
}
