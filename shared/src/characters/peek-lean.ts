/**
 * Hevalo moving with the phone. Tilting the phone to the right leans him to the right, through the page, and turns his
 * head toward that side, and to the left the same way; swinging it round, one side going back, turns his head toward
 * that side as a solid head would (head-round.ts), and swinging it back faces him to us again. He follows both on
 * soft springs, so he swings over and settles rather than tracking every tremor of the hand. The tilt is read from
 * gravity, so it means the same whether the phone is held upright or lies nearly flat; the swing from how fast the
 * phone turns about its own upright line. Both apps share this file: the phone reads the motion sensor, the website
 * the browser's motion events.
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

/** How his head turns as the phone swings round. */
export const PEEK_TURN = {
  /** how far his head turns, in degrees, all the way to a side: far enough to read as a turn, short of hiding his far eye */
  yawDeg: 26,
  /** the steps a player draws his turned face in, either way to a full turn: under half a degree each */
  steps: 72,
  /** how far the phone swings round, in degrees, to turn his head most of the way; he eases toward a full turn past it */
  fullDeg: 18,
  /**
   * How slowly, in seconds, the way the phone is held becomes the new middle he faces us from, should it stay swung
   * round (to about a third of the way): slow enough that swinging it back faces him to us, not past us.
   */
  settleSec: 15,
  /** a swing within this many degrees of the middle leaves him facing us */
  deadDeg: 4,
  /** a swing slower than this, in degrees a second, is a hand's drift, not a turn */
  stillRate: 4,
  /** the furthest the swing is counted, in degrees, either way */
  maxDeg: 60,
  /** the spring his head turns on: quick to follow, settling without a wobble */
  stiffness: 150,
  damping: 21,
  /** the smallest change that wakes the spring, as a share of a full turn */
  wakeShare: 0.01,
  /** how far the phone tilts, in degrees, to turn his head most of the way toward the side it goes down on */
  tiltFullDeg: 20,
} as const;

/**
 * How far the phone has swung round from the way it is held, in degrees (above 0 its right side gone back), after it
 * turned at `rate` degrees a second for `seconds`: the swing so far, plus this turn, with the way it is held slowly
 * becoming the middle. Never counted past `maxDeg` either way.
 */
export function swingAngle(previous: number, rate: number | null, seconds: number): number {
  const dt = Math.min(Math.max(seconds, 0), 0.25);
  const turned = rate != null && Number.isFinite(rate) && Math.abs(rate) >= PEEK_TURN.stillRate ? rate * dt : 0;
  const next = previous * Math.exp(-dt / PEEK_TURN.settleSec) + turned;
  return Math.max(-PEEK_TURN.maxDeg, Math.min(PEEK_TURN.maxDeg, Math.abs(next) < 1e-3 ? 0 : next));
}

/** How far his head turns for a swing, as a share of a full turn (above 0 to our right): none near the middle, then following it and easing into the limit. */
export function turnFor(swingDeg: number): number {
  const past = Math.abs(swingDeg) - PEEK_TURN.deadDeg;
  return past > 0 ? Math.sign(swingDeg) * Math.tanh(past / PEEK_TURN.fullDeg) : 0;
}

/**
 * How far his head turns for the phone's tilt, as a share of a full turn: toward the side going down, none while it is
 * held nearly level, then following it and easing into the limit. Added to the swing's (`turnFor`), so tilting turns
 * his head as well as leaning him.
 */
export function turnForTilt(tiltDeg: number): number {
  const past = Math.abs(tiltDeg) - PEEK_LEAN.deadDeg;
  return past > 0 ? Math.sign(tiltDeg) * Math.tanh(past / PEEK_TURN.tiltFullDeg) : 0;
}

/** The turn for a swing and a tilt together, never past a full turn. */
export const turnForMotion = (swingDeg: number, tiltDeg: number): number => Math.max(-1, Math.min(1, turnFor(swingDeg) + turnForTilt(tiltDeg)));

export interface LeanState {
  angle: number;
  speed: number;
}

/** A spring: how hard it pulls, how much it is damped, and how near and slow counts as still. */
export interface Spring {
  stiffness: number;
  damping: number;
  rest: number;
}

const LEAN_SPRING: Spring = { stiffness: PEEK_LEAN.stiffness, damping: PEEK_LEAN.damping, rest: 0.02 };
/** His head's turn, on a share of a full turn rather than degrees, so still is nearer. */
export const TURN_SPRING: Spring = { stiffness: PEEK_TURN.stiffness, damping: PEEK_TURN.damping, rest: 0.002 };

/**
 * One step of the spring carrying him toward `target`, `seconds` long: his lean by default, or his head's turn. Long
 * frames are cut into short steps so a stalled frame never throws him. `settled` once he is still at the target.
 */
export function stepLean(state: LeanState, target: number, seconds: number, spring: Spring = LEAN_SPRING): LeanState & { settled: boolean } {
  let { angle, speed } = state;
  let left = Math.min(Math.max(seconds, 0), 0.1);
  while (left > 0) {
    const dt = Math.min(left, 1 / 120);
    speed += (spring.stiffness * (target - angle) - spring.damping * speed) * dt;
    angle += speed * dt;
    left -= dt;
  }
  const settled = Math.abs(target - angle) < spring.rest && Math.abs(speed) < spring.rest * 2.5;
  return settled ? { angle: target, speed: 0, settled } : { angle, speed, settled };
}
