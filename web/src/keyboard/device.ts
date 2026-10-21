import { useSyncExternalStore } from 'react';
import type { KeyboardPlatform } from '@kurda/shared';
import { browserPlatform } from './guide';

/**
 * Whether the on-screen game keyboard is the one under a thumb or the one
 * beside a physical keyboard.
 *
 * - `touch`: a phone or a tablet on its own. The keys are the only way to
 *   type, so they are big, and ç ê î ş û get a row of double keys.
 * - `desktop`: a computer with a keyboard. Most letters come from the real
 *   keys, so the board's keys are a desk keyboard's size and shape, the
 *   Kurdish letters sit in a row of ordinary keys, and a line says the real
 *   keyboard works.
 */
export type KeyboardKind = 'touch' | 'desktop';

/** What a browser can say about how it is used. */
export interface KeyboardEnv {
  /** narrower than a desk keyboard's row fits: the touch keys whatever the device */
  narrow: boolean;
  /** a mouse or a trackpad is attached (`any-pointer: fine`) */
  anyFinePointer: boolean;
  /** the system it runs on, as the keyboard guide reads it (an iPad that calls itself a Mac is iOS) */
  platform: KeyboardPlatform | null;
}

/** Where a narrow window stops: the touch keyboard's own breakpoint (pages.css). */
export const NARROW = '(max-width: 640px)';
const FINE = '(any-pointer: fine)';

/**
 * Which keyboard to draw.
 *
 * The primary pointer alone used to be the wrong question: a laptop with a
 * touch screen reports a coarse pointer, and a desk keyboard was drawn as a
 * phone's. So a computer is recognised by any of the signs it gives — a mouse
 * or trackpad anywhere, or a desktop system (Windows, macOS, Linux) — and only
 * a phone or tablet with nothing but a touch screen gets the touch keys. A
 * window too narrow for a desk row gets them too, whatever it runs on.
 */
export function keyboardKind(env: KeyboardEnv): KeyboardKind {
  if (env.narrow) return 'touch';
  if (env.anyFinePointer) return 'desktop';
  if (env.platform === 'windows' || env.platform === 'mac' || env.platform === 'linux') return 'desktop';
  return 'touch';
}

function matches(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** This browser's answer, now. */
export function currentKeyboardKind(): KeyboardKind {
  return keyboardKind({ narrow: matches(NARROW), anyFinePointer: matches(FINE), platform: browserPlatform() });
}

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  // a mouse plugged in, or a window made narrower, changes the answer
  const lists = [NARROW, FINE].map((q) => {
    try {
      return matchMedia(q);
    } catch {
      return null;
    }
  });
  for (const l of lists) l?.addEventListener?.('change', onChange);
  return () => {
    for (const l of lists) l?.removeEventListener?.('change', onChange);
  };
}

/** The keyboard to draw, kept current as the window and the pointers change. */
export function useKeyboardKind(): KeyboardKind {
  return useSyncExternalStore(subscribe, currentKeyboardKind, () => 'desktop');
}
