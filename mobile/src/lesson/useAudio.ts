import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal audio playback for listening exercises (KUR-035).
 *
 * Uses the platform's `Audio` element when present (Expo web / any DOM
 * host), which supports `playbackRate` for the 0.75× slow button. On a host
 * without it, `supported` is false so the caller can fall back to the
 * "can't listen now" path. A load/playback failure surfaces via `error`,
 * which the exercise turns into an auto-skip (not a wrong answer).
 */
interface WebAudioEl {
  playbackRate: number;
  currentTime: number;
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

export interface AudioControls {
  supported: boolean;
  error: boolean;
  play: (rate?: number) => void;
}

export function useAudio(url: string | undefined): AudioControls {
  const Ctor = audioCtor();
  const supported = Ctor !== null && !!url;
  const elRef = useRef<WebAudioEl | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Ctor || !url) return;
    const el = new Ctor(url);
    const onError = () => setError(true);
    el.addEventListener('error', onError);
    elRef.current = el;
    setError(false);
    return () => {
      el.removeEventListener('error', onError);
      el.pause();
      elRef.current = null;
    };
  }, [Ctor, url]);

  const play = useCallback((rate = 1) => {
    const el = elRef.current;
    if (!el) return;
    el.playbackRate = rate;
    el.currentTime = 0;
    void el.play().catch(() => setError(true));
  }, []);

  return { supported, error, play };
}
