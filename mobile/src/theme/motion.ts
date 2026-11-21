/**
 * Motion tokens: durations and easings, matching the website's `--dur-*` and `--ease-*` (120, 200, 280, 400 and
 * 1600 ms) so lessons feel the same on both. Pure numbers, so the choreography built on them is testable;
 * `animate.ts` turns them into easings, springs and shared animations.
 *
 * The rules: interface motion finishes within 300 ms, with only bar fills and celebrations taking longer. Frequent
 * things arrive and stop without bounce; bounce is for thrown things and moments. Out-curves only. Only transform and
 * opacity animate, on the native driver. Under Reduce Motion nothing travels. Controls never loop; only art and
 * waiting states may, and only while their screen is in front (`useMotionAlive`) and not under Reduce Motion.
 * Nothing moves while someone is reading.
 */

import { APPLE_SPRINGS, TAB_CAPSULE, springFor } from '@kurda/shared';

export const duration = {
  /** Presses and small state changes. */
  quick: 120,
  /** Something arriving or leaving: a banner, a menu, a row. */
  base: 200,
  /** Something bigger arriving: a sheet, a card's details; still under the interface's 300 ms. */
  slow: 280,
  /** A bar or ring moving to its new value. */
  progress: 400,
  /** A whole celebration, first frame to last fleck. */
  celebrate: 1600,
} as const;

/** Cubic-bezier control points. `out` is the website's `--ease-out`; `emphasis` starts faster, for a value with somewhere to go (a bar, a count). */
export const curve = {
  out: [0.2, 0.8, 0.2, 1],
  emphasis: [0.16, 1, 0.3, 1],
} as const;

/**
 * The springs, as Apple tunes them (shared `motion-physics.ts` converts duration and bounce to stiffness and
 * damping). `chrome` is the interface's own: no bounce, 99% there at 300 ms, for segment capsules, steps,
 * menus and sheets. `standard` is Apple's smooth half-second spring, for a moment's own parts. `release` has a touch
 * of bounce, for something just let go with momentum. `bouncy` is for joyful moments (an emblem landing). `arrive`
 * grows a page out of the card that opened it (theme/origin), as long as the stack's fade so the two read as one.
 * `tabLead` and `tabFollow` carry the tab bar's capsule to another tab (shared `TAB_CAPSULE`).
 */
export const spring = {
  chrome: springFor({ duration: 0.25, bounce: 0 }),
  arrive: springFor({ duration: 0.35, bounce: 0 }),
  standard: springFor(APPLE_SPRINGS.smooth),
  release: springFor(APPLE_SPRINGS.snappy),
  bouncy: springFor(APPLE_SPRINGS.bouncy),
  tabLead: springFor(TAB_CAPSULE.lead),
  tabFollow: springFor(TAB_CAPSULE.follow),
} as const;

/** How far a finger moves before a tap becomes a drag: iOS's 10 points. */
export const DRAG_SLOP = 10;

/** How far a pressed button, card or tile shrinks under a finger. */
export const PRESS_SCALE = 0.97;

/**
 * How faint a held text link or icon button goes, the one dim for everything that answers by fading. Cards and rows
 * shrink or fill instead (`PressableScale`, `heldRow`).
 */
export const pressedDim = 0.6;

/** A wrong answer's shake: three diminishing swings in about 300 ms, as offsets from rest. */
export const SHAKE_STEPS: readonly number[] = [0, -7, 6, -5, 4, -2, 0];
export const SHAKE_MS = 300;

/**
 * A bell just rung: diminishing swings from its hanging point, still within half a second, in degrees from rest. Played
 * once on arrival, since a bell that keeps swinging is an alarm.
 */
export const RING_STEPS: readonly number[] = [0, -16, 12, -8, 4, 0];
export const RING_MS = 500;

/** A right answer's pop: up a little and back, once. */
export const POP_SCALE = 1.05;

/**
 * A game card turning over (who the impostor was, who you are): the turn's duration, the same for every card, and
 * its out-back overshoot past flat (about two hundredths of the turn). A moment, so it may exceed the interface's
 * 300 ms.
 */
export const CARD_TURN_MS = 480;
export const CARD_TURN_SETTLE = 0.8;

/** A slow pulse on something waiting to be noticed, never on a control, one way: `turn` for whose turn it is at a game's table, `breath` for a hero glyph. */
export const PULSE_MS = { turn: 900, breath: 1700 } as const;

/** New content in a list: how far it rises, the stagger between rows, and how many rows animate. */
export const ENTRANCE = {
  distance: 8,
  staggerMs: 40,
  /** About a screenful; rows further down appear without motion as they are scrolled to. */
  maxItems: 8,
  /** After this long the list has arrived, and rows mounted later (scrolling back up) just appear. */
  windowMs: 900,
} as const;

/** When row `index` of a newly arrived list starts to rise, or null when it should simply appear. */
export function entranceDelay(index: number): number | null {
  if (index < 0 || index >= ENTRANCE.maxItems) return null;
  return index * ENTRANCE.staggerMs;
}

/** How long a number counts up, by how far it moves: short moves are quick, long ones never drag; none under Reduce Motion. */
export function countUpMs(delta: number, reduce: boolean): number {
  if (reduce) return 0;
  const d = Math.abs(Math.round(delta));
  if (d === 0) return 0;
  return Math.round(Math.min(1000, 350 + d * 12));
}

/** The whole number to show `t` (0…1) of the way through a count from `from` to `to`. */
export function countAt(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return Math.round(from + (to - from) * k);
}

/** A cubic ease-out at `t` (close to `curve.out`), for counts animated by frames rather than the native driver. */
export function easeOut(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - k, 3);
}
