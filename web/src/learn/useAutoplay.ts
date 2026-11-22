import { useEffect } from 'react';
import { play } from '../lib/sound';
import { autoplayOn } from '../lib/sounds';

/** How long after an exercise appears its line starts: long enough to see what is asked. */
export const AUTOPLAY_MS = 350;

/**
 * Plays an exercise's Kurdish line by itself a beat after it appears, once, as a lesson voice speaks on its turn. Off
 * with Settings → Sounds → Play pronunciations automatically; a new exercise's line stops the last one.
 */
export function useAutoplay(src: string | null | undefined, enabled = true): void {
  useEffect(() => {
    if (!src || !enabled || !autoplayOn()) return;
    const id = setTimeout(() => play(src), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [src, enabled]);
}
