/**
 * A playback clock for lines with no recording (Hevalo's sign-up and intro lines change with the language and what was
 * typed): it starts with the line, runs as long as the line would take to say, then stops. The character reads it each
 * frame like a player's clock (characters/voice.ts), so the same lip-sync moves his mouth, silently.
 */
import { useEffect, useRef, useState } from 'react';
import type { PlaybackClock } from '../../characters/voice';

/** How long a line takes to say: about fourteen letters a second, with a breath before and after, and never under a second nor over eight. */
export function speechMs(text: string): number {
  const letters = text.replace(/\s+/g, '').length;
  return Math.max(1000, Math.min(8000, letters * 70 + 300));
}

/** A clock for one line, running from when it was made. */
export class SpokenLine implements PlaybackClock {
  readonly durationMs: number;
  private readonly startedAt: number;

  constructor(
    readonly text: string,
    private readonly now: () => number = Date.now,
  ) {
    this.durationMs = speechMs(text);
    this.startedAt = now();
  }

  get currentTime(): number {
    return Math.min(this.durationMs, this.now() - this.startedAt) / 1000;
  }

  get duration(): number {
    return this.durationMs / 1000;
  }

  get playing(): boolean {
    return this.now() - this.startedAt < this.durationMs;
  }
}

/** What a speaking character takes to say a line: its clock, whether it is still being said, and a name for it. */
export interface Speech {
  player: PlaybackClock | null;
  playing: boolean;
  /** Names the line, so the character works out a new timeline for each one, even with the same words. */
  source: string | null;
}

/**
 * Says `text` from the moment it is given and again each time it changes; once said, or when `speak` goes false (the
 * screen lost focus, or motion is reduced), the mouth rests. Null text says nothing.
 */
export function useSpokenLine(text: string | null, speak = true): Speech {
  const [said, setSaid] = useState<{ line: SpokenLine; source: string; playing: boolean } | null>(null);
  const count = useRef(0);

  useEffect(() => {
    if (!speak || !text) {
      setSaid(null);
      return;
    }
    const line = new SpokenLine(text);
    count.current += 1;
    const source = `said:${count.current}`;
    setSaid({ line, source, playing: true });
    // A little after the last sound, so the mouth comes to rest before the frames stop.
    const done = setTimeout(() => setSaid((now) => (now?.source === source ? { ...now, playing: false } : now)), line.durationMs + 80);
    return () => clearTimeout(done);
  }, [text, speak]);

  return said ? { player: said.line, playing: said.playing, source: said.source } : { player: null, playing: false, source: null };
}
