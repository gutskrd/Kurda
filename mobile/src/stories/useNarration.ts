import { useEffect, useMemo, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';
import { IDLE, Narrator, type NarrationState, type PlayerLike } from './narration';

/** expo-audio, behind the small surface the narrator uses. */
function expoPlayer(): PlayerLike {
  const player = createAudioPlayer(null);
  const ended = new Set<() => void>();
  const sub = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) for (const l of [...ended]) l();
  });
  return {
    load: (url) => player.replace({ uri: url }),
    play: () => player.play(),
    pause: () => player.pause(),
    setRate: (rate) => player.setPlaybackRate(rate),
    onEnded: (l) => {
      ended.add(l);
      return () => ended.delete(l);
    },
    release: () => {
      sub.remove();
      player.remove();
    },
  };
}

/**
 * One narrator for a screen, released with it. The audio stops when the
 * screen goes (or when the caller says — the questions starting), and nothing
 * is loaded until somebody presses Listen.
 */
export function useNarration(rate: number): { narrator: Narrator; state: NarrationState } {
  const [state, setState] = useState<NarrationState>(IDLE);
  const narrator = useMemo(() => new Narrator(expoPlayer, setState), []);
  useEffect(() => {
    narrator.setRate(rate);
  }, [narrator, rate]);
  useEffect(() => () => narrator.dispose(), [narrator]);
  return { narrator, state };
}
