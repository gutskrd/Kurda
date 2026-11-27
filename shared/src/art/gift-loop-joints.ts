/**
 * What the living animals and flowers (gift-loop-animals.ts, gift-loop-flowers.ts) move by: parts hung on chains of
 * joints, so a flower turns with the stem it sits on and an ear with the head it grows from, and smooth tracks through a
 * few held values, so a round reads as a gesture rather than a wave.
 */
import type { Pt } from './svg.js';
import type { GiftLoopPose } from './gift-loop.js';

/** A turn of `deg` degrees about a point, as the picture is drawn. */
export type GiftJoint = readonly [at: Pt, deg: number];

type Affine = readonly [number, number, number, number, number, number];

const times = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

function about([x, y]: Pt, deg: number): Affine {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
}

/**
 * The pose of a part whose origin is `origin`, hung on `joints` root first (a stem's foot, then the flower on its tip):
 * turned by them all, and carried to where they take its origin. `lift` moves the whole chain first, as a breath does.
 */
export function giftLoopChain(origin: Pt, joints: readonly GiftJoint[], lift: Pt = [0, 0]): Pick<GiftLoopPose, 'x' | 'y' | 'rot'> {
  let m: Affine = [1, 0, 0, 1, lift[0], lift[1]];
  let rot = 0;
  for (const [at, deg] of joints) {
    m = times(m, about(at, deg));
    rot += deg;
  }
  return { x: m[0] * origin[0] + m[2] * origin[1] + m[4] - origin[0], y: m[1] * origin[0] + m[3] * origin[1] + m[5] - origin[1], rot };
}

/** Where a point drawn at `p` is carried by `joints`. */
export function giftLoopCarry(p: Pt, joints: readonly GiftJoint[]): Pt {
  const { x, y } = giftLoopChain(p, joints);
  return [p[0] + x, p[1] + y];
}

/** Eases 0 to 1 in and out. */
const ease = (t: number): number => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;

/**
 * A value through its round, eased between held marks [share of the round, value]: from the first mark's value before
 * it to the last one's after, which must be the same, so it starts over where it began.
 */
export function giftLoopTrack(marks: ReadonlyArray<readonly [number, number]>): (t: number) => number {
  const first = marks[0];
  const last = marks[marks.length - 1];
  if (!first || !last || Math.abs(first[1] - last[1]) > 1e-9) throw new RangeError('art: a track must end where it starts');
  return (t: number): number => {
    if (t <= first[0]) return first[1];
    for (let i = 1; i < marks.length; i++) {
      const [t1, v1] = marks[i]!;
      if (t <= t1) {
        const [t0, v0] = marks[i - 1]!;
        return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0 || 1));
      }
    }
    return last[1];
  };
}

const TAU = Math.PI * 2;

/**
 * The breeze at share `t` of a round, felt `lag` of a round later downwind: a slow swell with a lighter flutter riding on
 * it, both whole waves of the round so it closes on itself. About -1 to 1.
 */
export function giftLoopBreeze(t: number, lag = 0, waves: readonly [number, number] = [1, 3]): number {
  const u = t - lag;
  return 0.75 * Math.sin(TAU * waves[0] * u) + 0.25 * Math.sin(TAU * waves[1] * u + 1.1);
}

/** A breath at share `t`: drawn in briskly, let out slowly, then a rest; 0 at rest, 1 full. */
export function giftLoopBreath(t: number): number {
  const u = ((t % 1) + 1) % 1;
  if (u < 0.38) return ease(u / 0.38);
  if (u < 0.86) return 1 - ease((u - 0.38) / 0.48);
  return 0;
}
