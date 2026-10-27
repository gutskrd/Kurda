import { prefersReducedMotion } from '../lib/motion';

/**
 * A moment between getting in and leaving the sign-in page, for Hevalo's hop
 * (auth/AuthCard). Signing in changes the session at once, and the
 * signed-in redirect would take the page away before he is seen to be
 * pleased; while a page holds the moment, the redirect waits and the page
 * leaves by itself when it is over.
 */
export const ARRIVAL_MS = 700;

let held = 0;

/** Hold the redirect until the returned function is called (once is enough; more do nothing). None for whoever asks for less motion. */
export function holdArrival(): (() => void) | null {
  if (prefersReducedMotion()) return null;
  held += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held -= 1;
  };
}

export function arrivalHeld(): boolean {
  return held > 0;
}

export const arrivalPause = (): Promise<void> => new Promise((done) => window.setTimeout(done, ARRIVAL_MS));
