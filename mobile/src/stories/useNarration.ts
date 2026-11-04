import { useEffect, useMemo, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';
import { IDLE, Narrator, type NarrationState, type PlayerLike, type PlayerStatus } from './narration';

/** How often the seek line is moved while the story plays: four times a second is smooth enough for a line, and cheap. */
const POSITION_EVERY_MS = 250;

/** expo-audio, behind the small surface the narrator uses. */
function expoPlayer(): PlayerLike {
  const player = createAudioPlayer(null);
  const ended = new Set<() => void>();
  const status = new Set<(s: PlayerStatus) => void>();
  const sub = player.addListener('playbackStatusUpdate', (update) => {
    if (update.didJustFinish) for (const l of [...ended]) l();
    const now: PlayerStatus = { buffering: !!update.isBuffering && !update.didJustFinish, error: update.error !== null && update.error !== undefined };
    for (const l of [...status]) l(now);
  });
  return {
    load: (url) => player.replace({ uri: url }),
    play: () => player.play(),
    pause: () => player.pause(),
    seek: (seconds) => void player.seekTo(seconds),
    setRate: (rate) => player.setPlaybackRate(rate),
    onEnded: (l) => {
      ended.add(l);
      return () => ended.delete(l);
    },
    onStatus: (l) => {
      status.add(l);
      return () => status.delete(l);
    },
    release: () => {
      sub.remove();
      player.remove();
    },
    clock: player,
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

/**
 * Where the sound is on the stitched track, in milliseconds, read a few
 * times a second while it plays and once more whenever the sentence changes —
 * a paused player stands still, and so does its line.
 */
export function useNarrationPosition(narrator: Narrator, state: NarrationState): number {
  const [position, setPosition] = useState(0);
  const { playing, scope, index, buffering } = state;
  useEffect(() => {
    setPosition(narrator.positionMs());
    if (!scope) return;
    if (!playing || buffering) return;
    const id = setInterval(() => setPosition(narrator.positionMs()), POSITION_EVERY_MS);
    return () => clearInterval(id);
  }, [narrator, playing, scope, index, buffering]);
  return scope ? position : 0;
}
