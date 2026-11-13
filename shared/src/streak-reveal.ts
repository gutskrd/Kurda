/**
 * The kept streak's card coming alive, the same on both apps.
 *
 * The card opens on yesterday: the medal unlit, in grey, and the streak's
 * number as it was, quietly. Then the medal takes its turn, the way a thing
 * with weight does: it gathers itself (squashes flat), hops (stretches up off
 * the card), turns to gold at the top of the hop as the app's one
 * celebration bursts out of it, and lands with a little give. As it lands
 * the number rolls on to today's and the words take their full ink. Only
 * then does the rest arrive, one thing after another so that each is read:
 * the word for the day, the week (its days one by one, today's last), what
 * stands under the card, and last the way on.
 *
 * Nothing waits on it: a tap on the card finishes it at once, and the way on
 * answers to its key from the first frame. Under reduced motion nothing
 * squashes, hops or travels: the grey medal cross-fades to the gold one, the
 * number changes where it is, and everything else is simply there.
 *
 * Leaving, the card goes the way it came, fast: its words fade and the medal
 * gathers itself once more and is gone, before the next screen.
 */

/** The medal at one point of its turn: how wide and how tall it is, about its foot, and how far it is off the card. */
export interface MedalPose {
  /** when, as a share of the turn */
  at: number;
  sx: number;
  sy: number;
  /** how far it is lifted, as a share of its own height: below zero is up */
  lift: number;
}

/**
 * The medal's turn. A squash keeps about as much medal as there was, wider
 * as it is flatter; the hop is narrower as it is taller; and it lands a
 * little flat before it stands.
 */
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
 * The medal's turn, drawn finely enough for something that only joins one
 * pose to the next with a straight line (the phone's animation driver, which
 * runs it off the main thread): between each pose and the next, `steps`
 * poses, eased in and out the way the website's own turn is.
 */
export function smoothPoses(poses: readonly MedalPose[], steps = 4): MedalPose[] {
  const fine: MedalPose[] = poses.slice(0, 1);
  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1]!;
    const b = poses[i]!;
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      // in and out, as a sine does it: slow away from a pose and slow into the next
      const e = 0.5 - Math.cos(Math.PI * u) / 2;
      const between = (from: number, to: number): number => from + (to - from) * e;
      fine.push({ at: a.at + (b.at - a.at) * u, sx: between(a.sx, b.sx), sy: between(a.sy, b.sy), lift: between(a.lift, b.lift) });
    }
  }
  return fine;
}

export interface StreakReveal {
  /** whether anything squashes, hops or travels, rather than fades */
  travel: boolean;
  /** when the medal's turn begins, and how long it takes */
  medalAtMs: number;
  medalMs: number;
  poses: readonly MedalPose[];
  /** when it turns from grey to gold, and how long the turning takes */
  lightAtMs: number;
  lightMs: number;
  /** when the celebration bursts out of it, and when that is felt and heard */
  burstAtMs: number;
  /** when the number rolls on to today's and the words take their ink */
  countAtMs: number;
  /** when the word for the day arrives */
  wordsAtMs: number;
  /** when the week's first day arrives, and how long after one day the next does; today's is last */
  weekAtMs: number;
  dayStepMs: number;
  /** when what stands under the card arrives */
  afterAtMs: number;
  /** when the way on arrives */
  onwardAtMs: number;
  /** when everything stands still */
  overMs: number;
}

/** How long the card takes to leave, once the way on is taken; nothing under reduced motion. */
export const STREAK_LEAVE_MS = 220;

/** The medal as it leaves: gathered flat, and smaller, until it is gone. */
export const STREAK_LEAVE_POSE = { sx: 1.3, sy: 0.3, scale: 0.4 } as const;

/** The seven days of a week, the last of them today's place in the order they arrive. */
const DAYS = 7;

/**
 * When each part of the card arrives, in ms from when the card appears.
 * `reduce` is a reader who asked for less motion: one short cross-fade, and
 * everything there at once.
 */
export function streakReveal(reduce: boolean): StreakReveal {
  if (reduce) {
    return { travel: false, medalAtMs: 0, medalMs: 0, poses: [], lightAtMs: 150, lightMs: 240, burstAtMs: 150, countAtMs: 150, wordsAtMs: 0, weekAtMs: 0, dayStepMs: 0, afterAtMs: 0, onwardAtMs: 0, overMs: 390 };
  }
  const medalAtMs = 480;
  const medalMs = 920;
  // gold at the top of the hop, which is where the burst comes out of it
  const lightAtMs = medalAtMs + Math.round(medalMs * 0.44);
  const burstAtMs = medalAtMs + Math.round(medalMs * 0.52);
  // the number turns as the medal comes down
  const countAtMs = medalAtMs + Math.round(medalMs * 0.7);
  const wordsAtMs = medalAtMs + medalMs + 60;
  const weekAtMs = wordsAtMs + 200;
  const dayStepMs = 70;
  const afterAtMs = weekAtMs + DAYS * dayStepMs + 120;
  const onwardAtMs = afterAtMs + 220;
  return { travel: true, medalAtMs, medalMs, poses: POSES, lightAtMs, lightMs: 150, burstAtMs, countAtMs, wordsAtMs, weekAtMs, dayStepMs, afterAtMs, onwardAtMs, overMs: onwardAtMs + 320 };
}
