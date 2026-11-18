/**
 * The one player for every short sound (letters, lesson recordings, the learner's own takes, dictionary entries,
 * stories read aloud). A new sound stops the last one. Speed keeps the pitch (`preservesPitch`, on by default).
 * Position, buffering and errors come from the element's own events, so a seek bar never disagrees with what is heard.
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
 * The shared <audio> element once anything has played, else null. A speaking character watches it to move its mouth
 * (characters/SpeakingCharacter.tsx); asking never creates it.
 */
export function soundPlayer(): HTMLAudioElement | null {
  return player;
}

function made(): HTMLAudioElement {
  if (!player) {
    const el = new Audio();
    // Report from the events, not the calls: switching clips pauses the old one before the new one plays.
    const now = (s: string | null) => () => listeners.forEach((l) => l(s, currentRate));
    el.addEventListener('playing', () => listeners.forEach((l) => l(current, currentRate)));
    el.addEventListener('ended', now(null));
    // After the "nothing playing" report, so a listener that starts the next clip has the last word.
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
    el.addEventListener('timeupdate', () => {
      const src = current;
      if (src) ticks.forEach((l) => l(src, el.currentTime * 1000));
    });
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
 * Seeks to `ms`. Some browsers drop a seek made before metadata arrives, so it is repeated once the metadata is in, for
 * this source only.
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
  // Loading a source resets the rate to the default, so both are set.
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
  if (fromMs > 0) placeAt(el, src, fromMs);
  const started = el.play() as Promise<void> | undefined;
  started?.catch((err: unknown) => {
    listeners.forEach((l) => l(null, currentRate));
    // A play cut short by the next clip is not a failure; a clip that would not start at all is.
    const name = err instanceof Error ? err.name : '';
    if (current === src && name !== 'AbortError') failures.forEach((l) => l(src));
  });
}

/** Continues `src` from where it paused without reloading; false when another clip has taken the player since. */
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

/** Stops whatever is sounding; the clip keeps its place for `resume`. */
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

/** Hears which source is playing and at what speed, or null when none is. */
export function onPlaying(listener: (src: string | null, rate: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hears when a clip plays to its end (not when stopped or replaced), which moves a story on to its next sentence. */
export function onEnded(listener: (src: string) => void): () => void {
  endings.add(listener);
  return () => endings.delete(listener);
}

/** Hears the playing clip's position a few times a second. */
export function onTime(listener: (src: string, ms: number) => void): () => void {
  ticks.add(listener);
  return () => ticks.delete(listener);
}

/** Hears when the network holds a clip up (true) and when it plays on (false). */
export function onBuffering(listener: (src: string, waiting: boolean) => void): () => void {
  stalls.add(listener);
  return () => stalls.delete(listener);
}

/** Hears when a clip cannot play at all: the file is gone, or the browser refused it. */
export function onError(listener: (src: string) => void): () => void {
  failures.add(listener);
  return () => failures.delete(listener);
}

/** Changes the speed of the current sound and of what plays next. */
export function setRate(rate: number): void {
  currentRate = rate;
  if (!player) return;
  player.defaultPlaybackRate = rate;
  player.playbackRate = rate;
}
