/**
 * One player for every short sound in the app: a letter on the alphabet page,
 * a lesson's recording, the learner's own take. A new sound stops the last one
 * rather than talking over it, which is what a tap on a second letter — or a
 * second "Hear it" — means.
 *
 * It lived in the alphabet page (alphabet/audio.ts still re-exports it). Lessons
 * need the same thing plus a speed: the listening exercise's 0.75× button plays
 * the same recording slower, and `preservesPitch` (on by default in browsers)
 * keeps it the same voice rather than a lower one.
 */
let player: HTMLAudioElement | null = null;
let current: string | null = null;
let currentRate = 1;
const listeners = new Set<(src: string | null, rate: number) => void>();

export function play(src: string, rate = 1): void {
  if (!player) {
    player = new Audio();
    // the events, not the calls, say what is sounding: a pause from switching clips arrives before the new one plays
    const now = (s: string | null) => () => listeners.forEach((l) => l(s, currentRate));
    player.addEventListener('playing', () => listeners.forEach((l) => l(current, currentRate)));
    player.addEventListener('ended', now(null));
    player.addEventListener('pause', now(null));
    player.addEventListener('error', now(null));
  }
  player.pause();
  current = src;
  currentRate = rate;
  player.src = src;
  // loading a source resets the rate to the default one, so both are set
  player.defaultPlaybackRate = rate;
  player.playbackRate = rate;
  const started = player.play() as Promise<void> | undefined;
  started?.catch(() => listeners.forEach((l) => l(null, currentRate)));
}

/** Stop whatever is sounding — a lesson left mid-sentence should not keep talking. */
export function stop(): void {
  player?.pause();
}

/** Hear which sound is playing (its source, and at what speed), or null when none is. */
export function onPlaying(listener: (src: string | null, rate: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
