import { useEffect, useRef } from 'react';
import type { AudioControls } from './useAudio';

/** How long after an exercise appears its recording starts: long enough to see what is asked. */
export const AUTOPLAY_MS = 250;

/**
 * Plays a recording once by itself, AUTOPLAY_MS after its exercise appears or as soon after as it loads, as a lesson
 * voice speaks on its turn. If the learner already started it, that counts as the once, so the timer never restarts a
 * clip behind them. A new source starts the count again.
 */
export function useAutoplayOnce(audio: AudioControls, enabled: boolean): void {
  const { play, playing, source } = audio;
  // When the source now loading was first asked for, and the one already played (by itself or by a tap).
  const shown = useRef({ source, at: Date.now() });
  if (shown.current.source !== source) shown.current = { source, at: Date.now() };
  const done = useRef<string | null>(null);
  const loaded = audio.clock !== null && source !== null;
  useEffect(() => {
    if (playing && source) done.current = source;
  }, [playing, source]);
  useEffect(() => {
    if (!loaded || !enabled || done.current === source) return;
    const id = setTimeout(
      () => {
        // A tap while the timer ran already counts as the once.
        if (done.current === source) return;
        done.current = source;
        play(1);
      },
      Math.max(0, AUTOPLAY_MS - (Date.now() - shown.current.at)),
    );
    return () => clearTimeout(id);
  }, [loaded, enabled, source, play]);
}
