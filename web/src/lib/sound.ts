/**
 * One player for every short sound in the app: a letter on the alphabet page,
 * a lesson's recording, the learner's own take. A new sound stops the last one
 * rather than talking over it, which is what a tap on a second letter — or a
 * second "Hear it" — means.
 *
 * It lived in the alphabet page (alphabet/audio.ts still re-exports it). Lessons
 * need the same thing plus a speed: the listening exercise's 0.75× button plays
 * the same recording slower, and `preservesPitch` (on by default in browsers)
 * keeps it the same voice rather than a lower one. A dictionary entry's
 * pronunciation and a story read aloud play through it too.
 *
 * A story's player needs a little more than play and stop: where the clip is
 * (`position`, `onTime`), a way to start a clip part-way through or move
 * within it (`play` with `fromMs`, `seek`), to carry on after a pause without
 * starting the sentence over (`resume`), and to know when the network is
 * holding the sound up or has lost it (`onBuffering`, `onError`). All of it
 * is read off the one element's own events, so a bar that shows them never
 * disagrees with what is heard.
 */
let player: HTMLAudioElement | null = null;
let current: string | null = null;
let currentRate = 1;
const listeners = new Set<(src: string | null, rate: number) => void>();
const endings = new Set<(src: string) => void>();
const ticks = new Set<(src: string, ms: number) => void>();
const stalls = new Set<(src: string, waiting: boolean) => void>();
const failures = new Set<(src: string) => void>();

/**
 * The one <audio> every sound plays through, once anything has played; null
 * before. A speaking character watches it to move its mouth with the
 * recording (characters/SpeakingCharacter.tsx) rather than playing a copy of
 * its own, and showing one never makes the element.
 */
export function soundPlayer(): HTMLAudioElement | null {
  return player;
}

function made(): HTMLAudioElement {
  if (!player) {
    const el = new Audio();
    // the events, not the calls, say what is sounding: a pause from switching clips arrives before the new one plays
    const now = (s: string | null) => () => listeners.forEach((l) => l(s, currentRate));
    el.addEventListener('playing', () => listeners.forEach((l) => l(current, currentRate)));
    el.addEventListener('ended', now(null));
    // after the "nothing is playing" above, so a listener that starts the next clip is the last word
    el.addEventListener('ended', () => {
      const done = current;
      if (done) endings.forEach((l) => l(done));
    });
    el.addEventListener('pause', now(null));
    el.addEventListener('error', now(null));
    el.addEventListener('error', () => {
      const lost = current;
      if (lost) failures.forEach((l) => l(lost));
    });
    // where the clip is, a few times a second, for a seek line to follow
    el.addEventListener('timeupdate', () => {
      const src = current;
      if (src) ticks.forEach((l) => l(src, el.currentTime * 1000));
    });
    // the network holding the sound up, and letting it go again
    const stalled = (waiting: boolean) => () => {
      const src = current;
      if (src) stalls.forEach((l) => l(src, waiting));
    };
    el.addEventListener('waiting', stalled(true));
    el.addEventListener('stalled', stalled(true));
    el.addEventListener('playing', stalled(false));
    el.addEventListener('canplay', stalled(false));
    player = el;
  }
  return player;
}

/**
 * Put the clip at `ms`. Before its metadata has arrived a browser queues the
 * seek, but not every one keeps it when the source is still being chosen, so
 * it is asked for again once the metadata is in — for this source only, in
 * case the next clip has taken the element by then.
 */
function placeAt(el: HTMLAudioElement, src: string, ms: number): void {
  const at = ms / 1000;
  el.currentTime = at;
  if (el.readyState >= 1) return;
  const again = (): void => {
    if (current === src && Math.abs(el.currentTime - at) > 0.25) el.currentTime = at;
  };
  el.addEventListener('loadedmetadata', again, { once: true });
}

/** Play `src` from its start, or from `fromMs` into it, at `rate`. */
export function play(src: string, rate = 1, fromMs = 0): void {
  const el = made();
  el.pause();
  current = src;
  currentRate = rate;
  el.src = src;
  // loading a source resets the rate to the default one, so both are set
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
  if (fromMs > 0) placeAt(el, src, fromMs);
  const started = el.play() as Promise<void> | undefined;
  started?.catch((err: unknown) => {
    listeners.forEach((l) => l(null, currentRate));
    // a play cut short by the next clip is not a failure; a clip that would not start at all is
    const name = err instanceof Error ? err.name : '';
    if (current === src && name !== 'AbortError') failures.forEach((l) => l(src));
  });
}

/**
 * Carry on with `src` from where it was paused, without loading it again.
 * False when the player has moved on to something else since, in which case
 * the caller starts the clip afresh.
 */
export function resume(src: string): boolean {
  if (!player || current !== src || player.ended) return false;
  const started = player.play() as Promise<void> | undefined;
  started?.catch((err: unknown) => {
    listeners.forEach((l) => l(null, currentRate));
    const name = err instanceof Error ? err.name : '';
    if (current === src && name !== 'AbortError') failures.forEach((l) => l(src));
  });
  return true;
}

/** Stop whatever is sounding — a lesson left mid-sentence should not keep talking. The clip keeps its place for `resume`. */
export function stop(): void {
  player?.pause();
}

/** Move within the clip that is loaded now. */
export function seek(ms: number): void {
  if (!player || !current) return;
  placeAt(player, current, Math.max(0, ms));
}

/** Which clip is loaded, and how far into it the player is. */
export function position(): { src: string | null; ms: number } {
  return { src: current, ms: player ? player.currentTime * 1000 : 0 };
}

/** Hear which sound is playing (its source, and at what speed), or null when none is. */
export function onPlaying(listener: (src: string | null, rate: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Hear when a clip plays to its end — not when it is stopped or replaced —
 * which is what a story read aloud sentence by sentence moves on with.
 */
export function onEnded(listener: (src: string) => void): () => void {
  endings.add(listener);
  return () => endings.delete(listener);
}

/** Hear where the playing clip is, a few times a second (the browser's `timeupdate`). */
export function onTime(listener: (src: string, ms: number) => void): () => void {
  ticks.add(listener);
  return () => ticks.delete(listener);
}

/** Hear when the network is holding a clip up (true) and when it plays on (false). */
export function onBuffering(listener: (src: string, waiting: boolean) => void): () => void {
  stalls.add(listener);
  return () => stalls.delete(listener);
}

/** Hear when a clip could not be played at all: the file is gone, or the browser refused it. */
export function onError(listener: (src: string) => void): () => void {
  failures.add(listener);
  return () => failures.delete(listener);
}

/** Change the speed of what is sounding now, and of what plays next at that speed. */
export function setRate(rate: number): void {
  currentRate = rate;
  if (!player) return;
  player.defaultPlaybackRate = rate;
  player.playbackRate = rate;
}
