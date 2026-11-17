/**
 * The kept streak's card coming alive, alike on both apps. It opens on yesterday with the medal grey and the old number.
 * The medal squashes, hops, turns gold at the top of the hop as the celebration bursts from it, and lands; the number rolls
 * to today's, then the word for the day, the week's days one by one (today last), what stands under the card and the way
 * on arrive in turn. A tap finishes it at once and the way on answers its key from the first frame. Under reduced motion
 * the medal cross-fades and everything else is simply there. Leaving, the card fades and the medal squashes away quickly.
 */

/** The medal at one point of its turn: its width and height about its foot, and how far it is off the card. */
export interface MedalPose {
  /** when, as a share of the turn */
  at: number;
  sx: number;
  sy: number;
  /** how far it is lifted, as a share of its own height; below zero is up */
  lift: number;
}

/** The medal's turn: a squash keeps about its area, a hop is narrower as it is taller, and it lands a little flat before standing. */
const POSES: readonly MedalPose[] = [
  { at: 0, sx: 1, sy: 1, lift: 0 },
  { at: 0.14, sx: 1.18, sy: 0.62, lift: 0 },
  { at: 0.3, sx: 1.34, sy: 0.4, lift: 0 },
  { at: 0.46, sx: 0.8, sy: 1.26, lift: -0.36 },
  { at: 0.6, sx: 0.96, sy: 1.04, lift: -0.46 },
  { at: 0.78, sx: 0.92, sy: 1.1, lift: 0 },
  { at: 0.87, sx: 1.14, sy: 0.84, lift: 0 },
  { at: 1, sx: 1, sy: 1, lift: 0 },
];

/**
 * The turn sampled finely enough for a driver that joins poses with straight lines (the phone's off-thread animation):
 * `steps` poses between each pair, eased in and out like the website's turn.
 */
export function smoothPoses(poses: readonly MedalPose[], steps = 4): MedalPose[] {
  const fine: MedalPose[] = poses.slice(0, 1);
  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1]!;
    const b = poses[i]!;
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      // Sine easing: slow away from one pose and into the next.
      const e = 0.5 - Math.cos(Math.PI * u) / 2;
      const between = (from: number, to: number): number => from + (to - from) * e;
      fine.push({ at: a.at + (b.at - a.at) * u, sx: between(a.sx, b.sx), sy: between(a.sy, b.sy), lift: between(a.lift, b.lift) });
    }
  }
  return fine;
}

export interface StreakReveal {
  /** whether anything squashes, hops or travels rather than fades */
  travel: boolean;
  /** when the medal's turn begins, and how long it takes */
  medalAtMs: number;
  medalMs: number;
  poses: readonly MedalPose[];
  /** when it turns from grey to gold, and how long the turning takes */
  lightAtMs: number;
  lightMs: number;
  /** when the celebration bursts from it, and when that is felt and heard */
  burstAtMs: number;
  /** when the number rolls on to today's and the words take their ink */
  countAtMs: number;
  /** when the word for the day arrives */
  wordsAtMs: number;
  /** when the week's first day arrives, and the gap between days; today's is last */
  weekAtMs: number;
  dayStepMs: number;
  /** when what stands under the card arrives */
  afterAtMs: number;
  /** when the way on arrives */
  onwardAtMs: number;
  /** when everything stands still */
  overMs: number;
}

/** How long the card takes to leave once the way on is taken; nothing under reduced motion. */
export const STREAK_LEAVE_MS = 220;

/** The medal as it leaves: gathered flat, and smaller, until it is gone. */
export const STREAK_LEAVE_POSE = { sx: 1.3, sy: 0.3, scale: 0.4 } as const;

/** The days of a week, today's last in the order they arrive. */
const DAYS = 7;

/** When each part of the card arrives, in ms from its appearance; `reduce` gives one short cross-fade with everything there at once. */
export function streakReveal(reduce: boolean): StreakReveal {
  if (reduce) {
    return { travel: false, medalAtMs: 0, medalMs: 0, poses: [], lightAtMs: 150, lightMs: 240, burstAtMs: 150, countAtMs: 150, wordsAtMs: 0, weekAtMs: 0, dayStepMs: 0, afterAtMs: 0, onwardAtMs: 0, overMs: 390 };
  }
  const medalAtMs = 480;
  const medalMs = 920;
  // Gold at the top of the hop, where the burst comes out.
  const lightAtMs = medalAtMs + Math.round(medalMs * 0.44);
  const burstAtMs = medalAtMs + Math.round(medalMs * 0.52);
  // The number turns as the medal comes down.
  const countAtMs = medalAtMs + Math.round(medalMs * 0.7);
  const wordsAtMs = medalAtMs + medalMs + 60;
  const weekAtMs = wordsAtMs + 200;
  const dayStepMs = 70;
  const afterAtMs = weekAtMs + DAYS * dayStepMs + 120;
  const onwardAtMs = afterAtMs + 220;
  return { travel: true, medalAtMs, medalMs, poses: POSES, lightAtMs, lightMs: 150, burstAtMs, countAtMs, wordsAtMs, weekAtMs, dayStepMs, afterAtMs, onwardAtMs, overMs: onwardAtMs + 320 };
}
