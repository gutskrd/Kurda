/**
 * Hevalo leaning with the phone. Tilting the phone to the right leans him to the right, through the page, and to the
 * left the same way. He follows on a soft spring, so his head swings over and settles rather than tracking every
 * tremor of the hand. The tilt is read from gravity, so it means the same whether the phone is held upright or lies
 * nearly flat. Both apps share this file: the phone reads the motion sensor, the website the browser's orientation.
 */

/** How far he leans and how he gets there. */
export const PEEK_LEAN = {
  /** the most he leans either way, in degrees */
  maxDeg: 9,
  /** his lean per degree of the phone's tilt, before easing into `maxDeg` */
  gain: 0.5,
  /** tilt that is ignored, in degrees: a phone held by hand is never quite level */
  deadDeg: 1.5,
  /** the smallest change in where he should lean that wakes the spring, in degrees */
  wakeDeg: 0.12,
  /** the spring: firm enough to follow, damped just under critical for one small swing past */
  stiffness: 110,
  damping: 16,
  /** how often the phone's sensor is read while he is on screen */
  sampleMs: 40,
} as const;

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/**
 * The phone's tilt to the right, in degrees, from gravity in the screen's own axes (x to the right, y up the screen,
 * z out of it), pointing toward the ground. Null when there is no reading.
 */
export function tiltFromGravity(x: number, y: number, z: number): number | null {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length < 1e-3) return null;
  return Math.asin(Math.max(-1, Math.min(1, x / length))) * DEG;
}

/**
 * The same tilt from a browser's `deviceorientation` (`beta` front to back, `gamma` side to side, in degrees), turned
 * by the screen's own angle when the page is shown sideways.
 */
export function tiltFromOrientation(beta: number | null, gamma: number | null, screenAngle = 0): number | null {
  if (beta == null || gamma == null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const b = beta * RAD;
  const g = gamma * RAD;
  // Gravity in the device's axes for these angles.
  const gx = Math.sin(g) * Math.cos(b);
  const gy = -Math.sin(b);
  const gz = -Math.cos(g) * Math.cos(b);
  // The screen's right, in the device's axes, once the page is turned by `screenAngle`.
  const a = screenAngle * RAD;
  return tiltFromGravity(gx * Math.cos(a) - gy * Math.sin(a), gx * Math.sin(a) + gy * Math.cos(a), gz);
}

/** Where he leans for a tilt: nothing inside the dead zone, then following it and easing into the limit. */
export function leanFor(tiltDeg: number): number {
  const past = Math.abs(tiltDeg) - PEEK_LEAN.deadDeg;
  if (!(past > 0)) return 0;
  return Math.sign(tiltDeg) * PEEK_LEAN.maxDeg * Math.tanh((past * PEEK_LEAN.gain) / PEEK_LEAN.maxDeg);
}

export interface LeanState {
  angle: number;
  speed: number;
}

/**
 * One step of the spring carrying him toward `target`, `seconds` long. Long frames are cut into short steps so a
 * stalled frame never throws him. `settled` once he is still at the target.
 */
export function stepLean(state: LeanState, target: number, seconds: number): LeanState & { settled: boolean } {
  let { angle, speed } = state;
  let left = Math.min(Math.max(seconds, 0), 0.1);
  while (left > 0) {
    const dt = Math.min(left, 1 / 120);
    speed += (PEEK_LEAN.stiffness * (target - angle) - PEEK_LEAN.damping * speed) * dt;
    angle += speed * dt;
    left -= dt;
  }
  const settled = Math.abs(target - angle) < 0.02 && Math.abs(speed) < 0.05;
  return settled ? { angle: target, speed: 0, settled } : { angle, speed, settled };
}
