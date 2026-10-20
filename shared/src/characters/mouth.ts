/**
 * The ten mouth shapes of a person's face, seen from the front.
 *
 * Every shape is built the same way, so that they sit on one spot and follow
 * each other without a jump: the lips as one soft outline, the opening cut
 * into them, and the teeth and tongue kept inside the opening by a clip. Only
 * the opening's size and roundness, how far the corners lift, and how much of
 * the teeth and tongue shows change from one shape to the next.
 *
 * The lips are drawn first and the opening over them, rather than the lips as
 * two crescents around a hole: two shapes that only touch leave a hairline of
 * skin between them once they are drawn small, and one laid over the other
 * cannot.
 */
import type { Viseme } from '../lipsync/visemes.js';
import type { Knot } from './pen.js';
import { n } from '../art/svg.js';
import { clipDef, clipped, curve, fill, part, taper } from './pen.js';

export interface MouthStyle {
  /** the middle of the lips at rest, and half the mouth's width there */
  cx: number;
  cy: number;
  w: number;
  /** how full the lips are above and below the opening, as parts of `w` */
  upperLip: number;
  lowerLip: number;
  /** how far the corners lift at rest, as a part of `w` */
  smile: number;
  lip: string;
  upperLipColour: string;
  /** the line where closed lips meet */
  line: string;
  inside: string;
  teeth: string;
  tongue: string;
}

/** An open mouth's measurements, as parts of the resting half-width. */
interface Opening {
  /** half the opening's width */
  hw: number;
  /** how far its top and bottom reach from the resting lip line */
  up: number;
  down: number;
  /** where its corners sit, below the lip line (negative: lifted) */
  corner: number;
  /** 0 for the pointed corners of a smile, 1 for a round mouth */
  round: number;
  /** how much of the upper and lower teeth show */
  top: number;
  bottom: number;
  /** how high the tongue comes; `tip` lifts its tip to the teeth */
  tongue: number;
  tip?: boolean;
  /** how far the lips are pushed out round the opening (a pucker) */
  pout?: number;
}

/**
 * Measured against one another so each reads at a glance even when the face
 * is a few dozen pixels tall: `a` the widest and deepest, `o` round, `u` small
 * and pushed forward, `i` a wide smile with the teeth showing, `etc` the teeth
 * nearly together, `l` with the tongue lifted to the teeth.
 */
const OPEN: Record<Exclude<Viseme, 'rest' | 'mbp' | 'fv'>, Opening> = {
  a: { hw: 1.14, up: 0.36, down: 1.12, corner: 0.06, round: 0.5, top: 0.26, bottom: 0, tongue: 0.38 },
  e: { hw: 1.06, up: 0.26, down: 0.62, corner: -0.02, round: 0.3, top: 0.26, bottom: 0.1, tongue: 0.24 },
  i: { hw: 1.1, up: 0.18, down: 0.4, corner: -0.14, round: 0.15, top: 0.28, bottom: 0.17, tongue: 0 },
  o: { hw: 0.6, up: 0.42, down: 0.78, corner: 0.16, round: 1, top: 0.14, bottom: 0, tongue: 0.26, pout: 0.18 },
  u: { hw: 0.34, up: 0.22, down: 0.36, corner: 0.06, round: 1, top: 0, bottom: 0, tongue: 0, pout: 0.34 },
  etc: { hw: 1.0, up: 0.17, down: 0.36, corner: -0.05, round: 0.25, top: 0.25, bottom: 0.18, tongue: 0 },
  l: { hw: 0.9, up: 0.24, down: 0.62, corner: 0.02, round: 0.35, top: 0.24, bottom: 0, tongue: 0.5, tip: true },
};

/** The outline of an opening, or of the lips round it when `grow` lips' widths are added. */
function outline(cx: number, cy: number, o: Opening, w: number, upGrow = 0, downGrow = 0, sideGrow = 0): Knot[] {
  const hw = o.hw * w + sideGrow;
  const up = o.up * w + upGrow;
  const down = o.down * w + downGrow;
  const cornerY = cy + o.corner * w;
  const r = o.round;
  // the upper edge flattens toward the corners as a smile does; a round mouth stays round
  const shoulder = 0.86 + 0.1 * r;
  return [
    [cx - hw, cornerY, r],
    [cx - hw * 0.55, cy - up * shoulder + (cornerY - cy) * 0.35],
    [cx, cy - up],
    [cx + hw * 0.55, cy - up * shoulder + (cornerY - cy) * 0.35],
    [cx + hw, cornerY, r],
    [cx + hw * 0.55, cy + down * 0.86 + (cornerY - cy) * 0.2],
    [cx, cy + down],
    [cx - hw * 0.55, cy + down * 0.86 + (cornerY - cy) * 0.2],
  ];
}

function openMouth(s: MouthStyle, o: Opening, clipId: string): string {
  const { cx, cy, w } = s;
  const pout = (o.pout ?? 0) * w;
  const lips = outline(cx, cy, o, w, s.upperLip * w + pout * 0.8, s.lowerLip * w + pout, 0.06 * w + pout);
  const hole = curve(outline(cx, cy, o, w));
  const hw = o.hw * w;
  const top = cy - o.up * w;
  const bottom = cy + o.down * w;
  const inner: string[] = [];
  if (o.tongue > 0) {
    const th = o.tongue * w;
    const tongue: Knot[] = o.tip
      ? [
          [cx - hw * 0.9, bottom + w * 0.2],
          [cx - hw * 0.55, bottom - th * 0.45],
          [cx, top + o.top * w + 0.04 * w],
          [cx + hw * 0.55, bottom - th * 0.45],
          [cx + hw * 0.9, bottom + w * 0.2],
        ]
      : [
          [cx - hw * 0.85, bottom + w * 0.2],
          [cx - hw * 0.5, bottom - th * 0.8],
          [cx, bottom - th],
          [cx + hw * 0.5, bottom - th * 0.8],
          [cx + hw * 0.85, bottom + w * 0.2],
        ];
    inner.push(fill(curve(tongue), s.tongue));
  }
  // the teeth: a band hanging from the top of the opening and one rising from its foot,
  // each with a gently curved edge; the clip trims them to the opening
  if (o.top > 0) {
    const edge = top + o.top * w;
    inner.push(fill(curve([[cx - hw * 1.2, top - w, 0], [cx + hw * 1.2, top - w, 0], [cx + hw * 1.2, edge - 0.1 * w], [cx, edge], [cx - hw * 1.2, edge - 0.1 * w]]), s.teeth));
  }
  if (o.bottom > 0) {
    const edge = bottom - o.bottom * w;
    inner.push(fill(curve([[cx - hw * 1.2, bottom + w, 0], [cx - hw * 1.2, edge + 0.1 * w], [cx, edge], [cx + hw * 1.2, edge + 0.1 * w], [cx + hw * 1.2, bottom + w, 0]]), s.teeth));
  }
  // the dark of the mouth is a plain box inside the clip, so the opening's outline is written once
  const dark = box(cx - hw - w, top - w, 2 * (hw + w), bottom - top + 2 * w);
  return part([clipDef(clipId, hole)], [fill(curve(lips), s.lip), clipped(clipId, fill(dark, s.inside) + inner.join(''))]);
}

/** A rectangle as path data. */
const box = (x: number, y: number, w: number, h: number): string => `M${n(x)},${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;

/** At rest: the lips together and soft, the corners lifted in the character's own smile. */
function restMouth(s: MouthStyle): string {
  const { cx, cy, w } = s;
  const lift = s.smile * w;
  const lips: Knot[] = [
    [cx - w * 0.98, cy - lift, 0.4],
    [cx - w * 0.5, cy - s.upperLip * w * 0.7 - lift * 0.3],
    [cx, cy - s.upperLip * w * 0.55],
    [cx + w * 0.5, cy - s.upperLip * w * 0.7 - lift * 0.3],
    [cx + w * 0.98, cy - lift, 0.4],
    [cx + w * 0.45, cy + s.lowerLip * w * 0.95],
    [cx, cy + s.lowerLip * w * 1.1],
    [cx - w * 0.45, cy + s.lowerLip * w * 0.95],
  ];
  const seam = taper(
    [
      [cx - w, cy - lift * 1.1],
      [cx - w * 0.5, cy + lift * 0.15],
      [cx, cy + lift * 0.3],
      [cx + w * 0.5, cy + lift * 0.15],
      [cx + w, cy - lift * 1.1],
    ],
    [0, w * 0.13, w * 0.15, w * 0.13, 0],
  );
  return part([], [fill(curve(lips), s.lip), fill(seam, s.line)]);
}

/** b, m, p: the lips pressed flat and a little rolled in — no smile, a firmer line. */
function pressedMouth(s: MouthStyle): string {
  const { cx, cy, w } = s;
  const lips: Knot[] = [
    [cx - w * 0.84, cy, 0.5],
    [cx - w * 0.45, cy - s.upperLip * w * 0.85],
    [cx, cy - s.upperLip * w * 0.8],
    [cx + w * 0.45, cy - s.upperLip * w * 0.85],
    [cx + w * 0.84, cy, 0.5],
    [cx + w * 0.45, cy + s.lowerLip * w * 0.75],
    [cx, cy + s.lowerLip * w * 0.8],
    [cx - w * 0.45, cy + s.lowerLip * w * 0.75],
  ];
  const seam = taper(
    [
      [cx - w * 0.86, cy - w * 0.02],
      [cx - w * 0.4, cy + w * 0.03],
      [cx, cy + w * 0.03],
      [cx + w * 0.4, cy + w * 0.03],
      [cx + w * 0.86, cy - w * 0.02],
    ],
    [w * 0.08, w * 0.2, w * 0.22, w * 0.2, w * 0.08],
  );
  return part([], [fill(curve(lips), s.upperLipColour), fill(seam, s.line)]);
}

/** f, v: the top teeth resting on the lower lip, which is drawn in under them. */
function teethOnLip(s: MouthStyle, clipId: string): string {
  const { cx, cy, w } = s;
  const hw = w * 0.86;
  const top = cy - w * 0.26;
  const hole: Knot[] = [
    [cx - hw, cy + w * 0.02, 0.3],
    [cx - hw * 0.5, top + w * 0.02],
    [cx, top],
    [cx + hw * 0.5, top + w * 0.02],
    [cx + hw, cy + w * 0.02, 0.3],
    [cx + hw * 0.5, cy + w * 0.16],
    [cx, cy + w * 0.2],
    [cx - hw * 0.5, cy + w * 0.16],
  ];
  const lips: Knot[] = [
    [cx - hw - w * 0.06, cy + w * 0.02, 0.4],
    [cx - hw * 0.5, top - s.upperLip * w * 0.9],
    [cx, top - s.upperLip * w * 0.75],
    [cx + hw * 0.5, top - s.upperLip * w * 0.9],
    [cx + hw + w * 0.06, cy + w * 0.02, 0.4],
    [cx + hw * 0.5, cy + w * 0.3],
    [cx, cy + w * 0.34],
    [cx - hw * 0.5, cy + w * 0.3],
  ];
  // the lower lip, pulled up against the teeth
  const lower: Knot[] = [
    [cx - hw * 0.98, cy + w * 0.08, 0.3],
    [cx - hw * 0.45, cy + w * 0.1],
    [cx, cy + w * 0.09],
    [cx + hw * 0.45, cy + w * 0.1],
    [cx + hw * 0.98, cy + w * 0.08, 0.3],
    [cx + hw * 0.5, cy + w * 0.46],
    [cx, cy + w * 0.52],
    [cx - hw * 0.5, cy + w * 0.46],
  ];
  const teeth = curve([
    [cx - hw * 1.2, top - w, 0],
    [cx + hw * 1.2, top - w, 0],
    [cx + hw * 1.2, cy + w * 0.12, 0],
    [cx - hw * 1.2, cy + w * 0.12, 0],
  ]);
  return part(
    [clipDef(clipId, curve(hole))],
    [fill(curve(lips), s.upperLipColour), fill(curve(hole), s.inside), clipped(clipId, fill(teeth, s.teeth)), fill(curve(lower), s.lip)],
  );
}

/** All ten shapes for one face; `p` prefixes the clip ids so faces on one page never share one. */
export function humanMouths(s: MouthStyle, p: string): Record<Viseme, string> {
  const id = (v: Viseme): string => `${p}mouth-${v}`;
  return {
    rest: restMouth(s),
    mbp: pressedMouth(s),
    fv: teethOnLip(s, id('fv')),
    l: openMouth(s, OPEN.l, id('l')),
    etc: openMouth(s, OPEN.etc, id('etc')),
    a: openMouth(s, OPEN.a, id('a')),
    e: openMouth(s, OPEN.e, id('e')),
    i: openMouth(s, OPEN.i, id('i')),
    o: openMouth(s, OPEN.o, id('o')),
    u: openMouth(s, OPEN.u, id('u')),
  };
}
