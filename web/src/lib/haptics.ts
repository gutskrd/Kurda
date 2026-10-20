import { createPacer } from '@kurda/shared';

/**
 * A buzz on a touch screen, for the three moments worth one on the web.
 *
 * The phone app feels six kinds of moment (mobile/src/feedback/haptics.ts).
 * A browser is a lesser instrument: `navigator.vibrate` drives the motor
 * itself, with none of a phone's light, crisp taps, so a buzz for a tick of a
 * switch or a sent message would feel like a rattle rather than an answer. So
 * the website keeps only the moments that carry meaning on their own:
 *
 *   correct    a right answer — one short pulse
 *   wrong      an answer that was not — a gentle double, never a long buzz
 *   celebrate  a lesson finished, a new level, rank, league or badge, a gift
 *              opened — once
 *
 * Only where it can be felt and was asked for: a touch screen (a coarse
 * pointer), a browser that has `navigator.vibrate` (Safari on an iPhone does
 * not), the page in front, and Settings → Vibration on — which it is unless
 * turned off on this device. Paced by the same rules as the phone (shared
 * haptics.ts): never two within 60 ms, at most four in two seconds, a
 * celebration at most once in two.
 */
export type WebHapticEvent = 'correct' | 'wrong' | 'celebrate';

/** Milliseconds on, off, on — short, because the motor is driven at full strength. */
export const PATTERNS: Readonly<Record<WebHapticEvent, number | number[]>> = {
  correct: 14,
  wrong: [10, 70, 14],
  celebrate: [18, 60, 26],
};

const KEY = 'hevalo_vibration';
const pacer = createPacer();

/** Whether this device can buzz at all: a touch screen with a browser that offers it. */
export function canVibrate(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

/** Settings → Vibration. On unless turned off on this device. */
export function vibrationOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setVibration(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // private browsing without storage: the choice lasts as long as the page
  }
}

/** Feel `event`, if this device can and the reader has not turned it off. */
export function haptic(event: WebHapticEvent): void {
  if (!canVibrate() || !vibrationOn()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!pacer.allow(event, Date.now())) return;
  try {
    navigator.vibrate(PATTERNS[event]);
  } catch {
    // a browser that refuses (no user gesture yet, a policy) is a quiet page, not a broken one
  }
}

/** Forget the pacing so far — for tests, which each start with a still phone. */
export function resetHaptics(): void {
  pacer.reset();
}
