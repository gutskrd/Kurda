import { createPacer } from '@kurda/shared';

/**
 * Vibration for the three moments that carry meaning on their own: a right answer, a wrong one, and a celebration.
 * `navigator.vibrate` drives the motor at full strength, without a phone's light taps, so the website skips the
 * phone's smaller moments (mobile/src/feedback/haptics.ts). It only buzzes on a coarse pointer with `navigator.vibrate`,
 * with the page in front and Settings → Vibration on, paced as on the phone (shared haptics.ts).
 */
export type WebHapticEvent = 'correct' | 'wrong' | 'celebrate';

/** Milliseconds on, off, on; short, because the motor runs at full strength. */
export const PATTERNS: Readonly<Record<WebHapticEvent, number | number[]>> = {
  correct: 14,
  wrong: [10, 70, 14],
  celebrate: [18, 60, 26],
};

const KEY = 'hevalo_vibration';
const pacer = createPacer();

/** Whether this device can buzz: a touch screen with a browser that offers it. */
export function canVibrate(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

/** Settings → Vibration; on unless turned off on this device. */
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
    // Private browsing without storage: the choice lasts as long as the page.
  }
}

/** Buzzes for `event` if this device can and the reader has not turned it off. */
export function haptic(event: WebHapticEvent): void {
  if (!canVibrate() || !vibrationOn()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!pacer.allow(event, Date.now())) return;
  try {
    navigator.vibrate(PATTERNS[event]);
  } catch {
    // A browser may refuse (no user gesture yet, a policy); that is not an error.
  }
}

/** Forgets the pacing so far, for tests. */
export function resetHaptics(): void {
  pacer.reset();
}
