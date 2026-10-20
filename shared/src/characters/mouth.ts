/**
 * The ten mouth shapes of a person's face, seen from the front, all drawn as
 * variations of one smile.
 *
 * The smile is the face at rest: the lips parted a little over the upper
 * teeth, exactly as the character smiles. Every other shape moves the same
 * few things — how far the jaw drops, how wide the corners pull, how round the
 * opening is, how much of the teeth and tongue shows — from that smile, keeping
 * its corners, its lip colours and its teeth. So whichever two shapes follow
 * each other, the mouth changes and the face does not.
 *
 * Each shape is drawn the same way: the lower lip, then the upper lip, then
 * the opening over them with the teeth and tongue kept inside it by a clip.
 * One shape laid over another, rather than lips drawn as crescents round a
 * hole, so no hairline of skin can open between them at any size.
 */
import type { Viseme } from '../lipsync/visemes.js';
import type { Pt } from '../art/svg.js';
import { n } from '../art/svg.js';
import type { Knot } from './pen.js';
import { clipDef, clipped, curve, fill, oval, part, taper } from './pen.js';

export interface Smile {
  /** where the lips meet, at either side */
  corners: readonly [Pt, Pt];
  /** the opening at rest — the upper teeth framed by the lips: its two ends, and its top and bottom at the middle */
  open: { left: Pt; right: Pt; top: number; bottom: number };
  /** how far the upper lip rises above the opening, and the lower lip falls below it, at the middle */
  upperLip: number;
  lowerLip: number;
  /** how much the face is turned: the middle of the mouth sits this far toward the right end (0.5 is facing forward) */
  middle?: number;
  colours: { upperLip: string; lowerLip: string; line: string; inside: string; teeth: string; tongue: string };
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
  /** how much fuller the lips are, pushed forward round a round mouth */
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
  o: { width: 0.6, corner: 0.16, top: -0.08, drop: 0.7, round: 1, teeth: 0.5, lower: 0, tongue: 0.22, pout: 0.22 },
  u: { width: 0.38, corner: 0.12, top: 0.04, drop: 0.3, round: 1, teeth: 0, lower: 0, tongue: 0, pout: 0.36 },
};

/** The smile's measures, worked out once. */
function measures(s: Smile) {
  const [cl, cr] = s.corners;
  const { left, right, top, bottom } = s.open;
  const mid = s.middle ?? 0.5;
  const cx = left[0] + (right[0] - left[0]) * mid;
  const hw = (right[0] - left[0]) / 2;
  const endY = (left[1] + right[1]) / 2;
  return { cl, cr, left, right, top, bottom, mid, cx, hw, endY };
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
  const shoulder = (y: number): number => top + (y - top) * (0.12 + 0.5 * k.round);
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

/** The lips round an opening: the upper lip rising over it, the lower lip falling under it, both from the lips' corners. */
function lips(s: Smile, k: Shape, open: Knot[]): { upper: Knot[]; lower: Knot[] } {
  const m = measures(s);
  // the lips' corners stay with the smile's, drawn in with the opening and down with the jaw
  const pull = (c: Pt, end: Knot): Pt => [c[0] + (end[0] - (c === m.cl ? m.left[0] : m.right[0])), c[1] + (end[1] - (c === m.cl ? m.left[1] : m.right[1]))];
  const cl = pull(m.cl, open[0] as Knot);
  const cr = pull(m.cr, open[4] as Knot);
  const pout = k.pout * m.hw;
  const top = open[2] as Knot;
  const bottom = open[6] as Knot;
  const up = s.upperLip + pout * 0.8;
  const down = s.lowerLip + pout;
  const upper: Knot[] = [
    [cl[0], cl[1], 0.3],
    [cl[0] + (top[0] - cl[0]) * 0.5, top[1] - up * 0.85 + (cl[1] - top[1]) * 0.35],
    [top[0], top[1] - up],
    [cr[0] - (cr[0] - top[0]) * 0.5, top[1] - up * 0.85 + (cr[1] - top[1]) * 0.35],
    [cr[0], cr[1], 0.3],
    [top[0], top[1] + 0.2],
  ];
  const lower: Knot[] = [
    [cl[0], cl[1], 0.3],
    [top[0], Math.min(bottom[1], top[1] + 0.4)],
    [cr[0], cr[1], 0.3],
    [cr[0] - (cr[0] - bottom[0]) * 0.45, bottom[1] + down * 0.8],
    [bottom[0], bottom[1] + down],
    [cl[0] + (bottom[0] - cl[0]) * 0.55, bottom[1] + down * 0.8],
  ];
  return { upper, lower };
}

/** A rectangle as path data, for what fills an opening inside its clip. */
const box = (x: number, y: number, w: number, h: number): string => `M${n(x)},${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;

function shaped(s: Smile, k: Shape, clipId: string): string {
  const m = measures(s);
  const c = s.colours;
  const open = opening(s, k);
  const hole = curve(open);
  const { upper, lower } = lips(s, k, open);
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
    // the upper teeth are the smile's own, carried with the top of the mouth and trimmed by the opening
    const smile = opening(s, SHAPES.rest);
    const dy = top - m.top;
    const depth = (m.bottom - m.top) * (1 - k.teeth);
    const teeth = smile.map(([x, y, r], i) => [m.cx + (x - m.cx) * k.width * 1.04, y + dy - (i >= 5 && i <= 7 ? depth : 0) + (i === 2 ? -3 : 0), r] as Knot);
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
    [fill(curve(lower), c.lowerLip), fill(curve(upper), c.upperLip), clipped(clipId, inner.join(''))],
  );
}

/** b, m, p: the lips pressed together along the smile's own line, no teeth showing, a little fuller where they press. */
function pressed(s: Smile): string {
  const m = measures(s);
  const c = s.colours;
  const meet = (m.top + m.bottom) / 2 - (m.bottom - m.top) * 0.15;
  const line: Pt[] = [
    [m.cl[0] + 0.6, m.cl[1]],
    [m.cl[0] + (m.cx - m.cl[0]) * 0.5, meet + 0.15 * (m.cl[1] - meet)],
    [m.cx, meet + 0.2],
    [m.cr[0] - (m.cr[0] - m.cx) * 0.5, meet + 0.15 * (m.cr[1] - meet)],
    [m.cr[0] - 0.6, m.cr[1]],
  ];
  const up = s.upperLip + m.hw * 0.06;
  const down = s.lowerLip * 0.8;
  const upper: Knot[] = [
    [m.cl[0], m.cl[1], 0.3],
    [m.cl[0] + (m.cx - m.cl[0]) * 0.5, meet - up * 0.85],
    [m.cx, meet - up],
    [m.cr[0] - (m.cr[0] - m.cx) * 0.5, meet - up * 0.85],
    [m.cr[0], m.cr[1], 0.3],
    [m.cx, meet + 0.4],
  ];
  const lower: Knot[] = [
    [m.cl[0], m.cl[1], 0.3],
    [m.cx, meet],
    [m.cr[0], m.cr[1], 0.3],
    [m.cr[0] - (m.cr[0] - m.cx) * 0.45, meet + down * 0.85],
    [m.cx, meet + down],
    [m.cl[0] + (m.cx - m.cl[0]) * 0.55, meet + down * 0.85],
  ];
  const t = m.hw * 0.09;
  return part([], [fill(curve(lower), c.lowerLip), fill(curve(upper), c.upperLip), fill(taper(line, [t * 0.4, t, t * 1.1, t, t * 0.4]), c.line)]);
}

/** f, v: the upper teeth resting on the lower lip, which is drawn up and in under them, so only their edge shows. */
function teethOnLip(s: Smile, clipId: string): string {
  const m = measures(s);
  const c = s.colours;
  const k: Shape = { ...SHAPES.rest, width: 0.92, drop: -0.05 };
  const open = opening(s, k);
  const { upper } = lips(s, k, open);
  const tuck = m.top + (m.bottom - m.top) * 0.42;
  const l = (open[0] as Knot)[0];
  const r = (open[4] as Knot)[0];
  const full = s.lowerLip * 1.7;
  const lower: Knot[] = [
    [l - 0.6, (open[0] as Knot)[1] + 0.3, 0.3],
    [l + (m.cx - l) * 0.5, tuck + 0.15],
    [m.cx, tuck],
    [r - (r - m.cx) * 0.5, tuck + 0.15],
    [r + 0.6, (open[4] as Knot)[1] + 0.3, 0.3],
    [r - (r - m.cx) * 0.4, tuck + full * 0.85],
    [m.cx, tuck + full],
    [l + (m.cx - l) * 0.6, tuck + full * 0.85],
  ];
  const smile = curve(open);
  return part(
    [clipDef(clipId, smile)],
    [fill(curve(upper), c.upperLip), fill(smile, c.inside), clipped(clipId, fill(box(m.left[0] - 2, m.top - 3, m.hw * 2 + 4, m.bottom - m.top + 4), c.teeth)), fill(curve(lower), c.lowerLip)],
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
