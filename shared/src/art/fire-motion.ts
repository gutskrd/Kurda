/**
 * How the streak's fire moves (`fire.ts`): every moving part has a motion,
 * a few poses on fixed stops through its period, and both apps play the same
 * poses — the website as CSS keyframes, the phone off one native clock per
 * fire, sampled here.
 */

/**
 * Every part's period divides this, so the phone can drive a whole fire from
 * one looping clock and the loop never shows a seam.
 */
export const FIRE_CYCLE_MS = 4800;

/** Where a looping part's four poses fall in its period; after the last it eases back to the first. */
export const FIRE_LOOP_STOPS = [0, 0.25, 0.5, 0.75] as const;
/** Where a rising part's six poses fall: it appears, rises, fades, and starts again unseen. */
export const FIRE_RISE_STOPS = [0, 0.12, 0.35, 0.6, 0.85, 1] as const;
/** Where a growing part's four poses fall over the growth (`FIRE_GROW.ms`), eased between them; it stays at its last. */
export const FIRE_GROW_STOPS = [0, 0.3, 0.6, 1] as const;

/**
 * One pose of a moving part, in the drawing's units, about the part's own
 * origin: moved by `x`, `y`; stretched by `sx`, `sy`; leaning by `skew`
 * degrees (positive leans its top to the left, as CSS's skewX does); turned
 * by `r` degrees clockwise; `o` its opacity. Anything left out stays at rest.
 */
export interface FirePose {
  x?: number;
  y?: number;
  sx?: number;
  sy?: number;
  skew?: number;
  r?: number;
  o?: number;
}

export interface FireMotion {
  /**
   * 'loop' eases through `FIRE_LOOP_STOPS` and back; 'rise' runs straight
   * through `FIRE_RISE_STOPS`; 'grow' eases once through `FIRE_GROW_STOPS`
   * over the growth and stays
   */
  kind: 'loop' | 'rise' | 'grow';
  periodMs: number;
  /** how far into its period the part starts, 0 to 1 */
  phase: number;
  /** one pose per stop of its kind */
  poses: readonly FirePose[];
}

/** A motion moved by only `share` of its full amount: the light version's gentler flicker. */
export function calmMotion(motion: FireMotion, share: number): FireMotion {
  const toward = (v: number | undefined, rest: number): number | undefined => (v === undefined ? undefined : rest + (v - rest) * share);
  return {
    ...motion,
    poses: motion.poses.map((p) => ({
      ...p,
      x: toward(p.x, 0),
      y: toward(p.y, 0),
      sx: toward(p.sx, 1),
      sy: toward(p.sy, 1),
      skew: toward(p.skew, 0),
      r: toward(p.r, 0),
    })),
  };
}

/** Stops of a motion's kind. */
export const fireStops = (motion: FireMotion): readonly number[] => (motion.kind === 'loop' ? FIRE_LOOP_STOPS : motion.kind === 'rise' ? FIRE_RISE_STOPS : FIRE_GROW_STOPS);

/** The rest value of each pose field. */
const REST: Required<FirePose> = { x: 0, y: 0, sx: 1, sy: 1, skew: 0, r: 0, o: 1 };
export const FIRE_POSE_FIELDS = ['x', 'y', 'sx', 'sy', 'skew', 'r', 'o'] as const;

/**
 * Where a part is at `u` (0 to 1) through its own period, phase already
 * applied by the caller: a loop eases in and out between its poses (a sine
 * ease, the same curve the website's keyframes are given), and so does a
 * growth, which then stays at its last; a rise moves straight from one to
 * the next.
 */
export function firePoseAt(motion: FireMotion, u: number): Required<FirePose> {
  const stops = fireStops(motion);
  const poses = motion.poses;
  const grow = motion.kind === 'grow';
  const t = grow ? Math.min(1, Math.max(0, u)) : ((u % 1) + 1) % 1;
  let i = stops.length - 1;
  while (i > 0 && t < (stops[i] as number)) i -= 1;
  const from = stops[i] as number;
  const loop = motion.kind === 'loop';
  const last = i === stops.length - 1;
  // a loop's last pose eases back to its first by the end of the period; a rise and a growth hold their last
  const to = last ? (loop ? 1 : from) : (stops[i + 1] as number);
  const a = poses[i] ?? {};
  const b = last ? (loop ? (poses[0] ?? {}) : a) : (poses[i + 1] ?? {});
  const span = to - from;
  const raw = span > 0 ? (t - from) / span : 0;
  const k = motion.kind === 'rise' ? raw : (1 - Math.cos(Math.PI * raw)) / 2;
  const out = { ...REST };
  for (const f of FIRE_POSE_FIELDS) {
    const va = a[f] ?? REST[f];
    const vb = b[f] ?? REST[f];
    out[f] = va + (vb - va) * k;
  }
  return out;
}

/**
 * A part's motion laid along one clock running 0 → 1 over `FIRE_CYCLE_MS`,
 * for the phone: `input` and the pose at each, sampled finely enough
 * (`perPeriod` samples each time round) that straight lines between samples
 * follow the curve. The first and last samples are the same pose, so the
 * clock loops without a seam. A growth is laid along its own run, 0 → 1
 * over `FIRE_GROW.ms`, instead.
 */
export function fireSamples(motion: FireMotion, perPeriod = 24): { input: number[]; poses: Required<FirePose>[] } {
  const repeats = motion.kind === 'grow' ? 1 : FIRE_CYCLE_MS / motion.periodMs;
  const count = Math.round(repeats * perPeriod);
  const input: number[] = [];
  const poses: Required<FirePose>[] = [];
  for (let s = 0; s <= count; s++) {
    const at = s / count;
    input.push(at);
    poses.push(firePoseAt(motion, motion.kind === 'grow' ? at : at * repeats + motion.phase));
  }
  return { input, poses };
}
