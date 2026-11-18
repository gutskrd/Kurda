import { useSyncExternalStore } from 'react';
import type { KeyboardPlatform } from '@kurda/shared';
import { browserPlatform } from './guide';

/**
 * Which on-screen game keyboard to draw: `touch` for a phone or tablet, where the keys are the only way to type and
 * so are big, or `desktop` for a computer, where the keys are desk-sized and a line says the real keyboard works.
 */
type KeyboardKind = 'touch' | 'desktop';

/** What a browser can say about how it is used. */
interface KeyboardEnv {
  /** Too narrow for a desk keyboard's row, so the touch keys are drawn whatever the device. */
  narrow: boolean;
  /** A mouse or trackpad is attached (`any-pointer: fine`). */
  anyFinePointer: boolean;
  /** The system, as the keyboard guide reads it; an iPad that reports itself as a Mac is iOS. */
  platform: KeyboardPlatform | null;
}

/** The touch keyboard's breakpoint (pages.css). */
const NARROW = '(max-width: 640px)';
const FINE = '(any-pointer: fine)';

/**
 * Which keyboard to draw. The primary pointer alone is not enough, since a touch-screen laptop reports a coarse one;
 * any fine pointer or a desktop system means a computer. A window too narrow for a desk row gets the touch keys.
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
  // A mouse plugged in or a window resized changes the answer.
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
