import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { PlaybackClock } from '../characters/voice';

/**
 * Minimal audio playback for listening exercises (KUR-035), the model
 * recordings and the dictionary's pronunciations.
 *
 * Uses the platform's `Audio` element when present (Expo web / any DOM
 * host), which supports `playbackRate` for the 0.75× slow button. On a phone
 * it is expo-audio's player, loaded only there (as google.ts loads its SDK):
 * the module cannot be evaluated outside a native build. On a host with
 * neither, `supported` is false so the caller can fall back to the "can't
 * listen now" path. A load/playback failure surfaces via `error`, which the
 * exercise turns into an auto-skip (not a wrong answer).
 *
 * `clock` is the player itself, for a speaking character to follow while
 * `playing` says the recording plays; `source` is the URL it has loaded.
 */
interface WebAudioEl {
  playbackRate: number;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
}
type AudioCtor = new (src: string) => WebAudioEl;

function audioCtor(): AudioCtor | null {
  const g = globalThis as { Audio?: AudioCtor };
  return typeof g.Audio === 'function' ? g.Audio : null;
}

/** Whether this host can play a recording at all, before there is one to play. */
export function canPlayAudio(): boolean {
  return audioCtor() !== null || Platform.OS !== 'web';
}

export interface AudioControls {
  supported: boolean;
  error: boolean;
  /** the recording is playing now */
  playing: boolean;
  /** the loaded recording's player; null until one is loaded */
  clock: PlaybackClock | null;
  /** the URL `clock` has loaded; null until one is */
  source: string | null;
  play: (rate?: number) => void;
}

interface Loaded {
  clock: PlaybackClock;
  play: (rate: number) => void;
  release: () => void;
}

interface Events {
  playing: (playing: boolean) => void;
  error: () => void;
}

function elementPlayback(Ctor: AudioCtor, url: string, on: Events): Loaded {
  const el = new Ctor(url);
  const failed = () => on.error();
  const started = () => on.playing(true);
  const stopped = () => on.playing(false);
  el.addEventListener('error', failed);
  el.addEventListener('play', started);
  el.addEventListener('pause', stopped);
  el.addEventListener('ended', stopped);
  return {
    clock: {
      get currentTime() {
        return el.currentTime;
      },
      get duration() {
        return el.duration;
      },
      get playing() {
        return !el.paused && !el.ended;
      },
    },
    play: (rate) => {
      el.playbackRate = rate;
      el.currentTime = 0;
      void el.play().catch(failed);
    },
    release: () => {
      el.removeEventListener('error', failed);
      el.removeEventListener('play', started);
      el.removeEventListener('pause', stopped);
      el.removeEventListener('ended', stopped);
      el.pause();
    },
  };
}

async function phonePlayback(url: string, on: Events): Promise<Loaded> {
  const { createAudioPlayer } = await import('expo-audio');
  const player = createAudioPlayer({ uri: url });
  const sub = player.addListener('playbackStatusUpdate', (status) => {
    on.playing(status.playing);
    if (status.error) on.error();
  });
  return {
    clock: player,
    play: (rate) => {
      player.setPlaybackRate(rate);
      void player.seekTo(0);
      player.play();
    },
    release: () => {
      sub.remove();
      player.remove();
    },
  };
}

export function useAudio(url: string | undefined): AudioControls {
  const Ctor = audioCtor();
  const phone = !Ctor && Platform.OS !== 'web';
  const supported = (Ctor !== null || phone) && !!url;
  const loadedRef = useRef<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<{ url: string; clock: PlaybackClock } | null>(null);

  useEffect(() => {
    if (!url || (!Ctor && !phone)) return;
    let live = true;
    let loaded: Loaded | null = null;
    const on: Events = {
      playing: (now) => {
        if (live) setPlaying(now);
      },
      error: () => {
        if (live) setError(true);
      },
    };
    const take = (next: Loaded): void => {
      if (!live) {
        next.release();
        return;
      }
      loaded = next;
      loadedRef.current = next;
      setCurrent({ url, clock: next.clock });
    };
    setError(false);
    if (Ctor) take(elementPlayback(Ctor, url, on));
    else void phonePlayback(url, on).then(take, on.error);
    return () => {
      live = false;
      loaded?.release();
      loadedRef.current = null;
      setPlaying(false);
      setCurrent(null);
    };
  }, [Ctor, phone, url]);

  const play = useCallback((rate = 1) => {
    loadedRef.current?.play(rate);
  }, []);

  return { supported, error, playing, clock: current?.clock ?? null, source: current?.url ?? null, play };
}
