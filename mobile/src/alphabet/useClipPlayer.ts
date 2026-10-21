import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackClock } from '../characters/voice';
import { canPlayAudio, useAudio } from '../lesson/useAudio';

export interface ClipPlayer {
  /** this phone can play a recording at all */
  supported: boolean;
  play: (src: string) => void;
  /** whether `src` is what is sounding now */
  isPlaying: (src: string | null) => boolean;
  /** the player a speaking character follows for `src`, while `src` is the one loaded */
  clockFor: (src: string | null) => PlaybackClock | null;
}

/**
 * One player for the whole alphabet screen, as the website has: a new sound
 * stops the last one rather than talking over it, which is what a tap on a
 * second letter — or on the word after its letter — means.
 *
 * The lessons' player underneath (lesson/useAudio.ts): asking for another
 * recording loads it in place of the last and plays it once it has loaded;
 * asking for the one already loaded plays it again from the start.
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
