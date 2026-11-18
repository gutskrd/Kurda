import { prefersReducedMotion } from '../lib/motion';

/**
 * A pause between signing in and leaving the sign-in page, so Hevalo's hop (auth/AuthCard) is seen. While a page
 * holds it, the signed-in redirect waits and the page leaves by itself afterwards.
 */
const ARRIVAL_MS = 700;

let held = 0;

/** Holds the redirect until the returned function is called; null under Reduce Motion. Extra calls do nothing. */
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
