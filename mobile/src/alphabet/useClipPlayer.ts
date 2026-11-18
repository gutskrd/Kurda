import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackClock } from '../characters/voice';
import { canPlayAudio, useAudio } from '../lesson/useAudio';

export interface ClipPlayer {
  /** This phone can play a recording at all. */
  supported: boolean;
  play: (src: string) => void;
  /** Whether `src` is sounding now. */
  isPlaying: (src: string | null) => boolean;
  /** The player a speaking character follows for `src`, while `src` is the one loaded. */
  clockFor: (src: string | null) => PlaybackClock | null;
}

/**
 * One player for the whole alphabet screen, as on the web: a new sound stops the last instead of talking over it.
 * Built on the lessons' player (lesson/useAudio.ts): another recording loads in place of the last and plays once
 * loaded, and the loaded one replays from the start.
 */
export function useClipPlayer(): ClipPlayer {
  const [asked, setAsked] = useState<{ src: string; n: number } | null>(null);
  const audio = useAudio(asked?.src);
  const played = useRef(0);
  const { source, play: start } = audio;

  useEffect(() => {
    if (!asked || source !== asked.src || played.current === asked.n) return;
    played.current = asked.n;
    start(1);
  }, [asked, source, start]);

  const play = useCallback((src: string) => setAsked((was) => ({ src, n: (was?.n ?? 0) + 1 })), []);

  return {
    supported: canPlayAudio(),
    play,
    isPlaying: (src) => !!src && audio.playing && audio.source === src,
    clockFor: (src) => (src && audio.source === src ? audio.clock : null),
  };
}
