/**
 * Words with no recording behind them, said anyway.
 *
 * A speaking character follows a player's clock (characters/voice.ts) and
 * shapes its mouth from the recording's timeline, or from the words once the
 * recording's length is known. Hevalo's lines on the sign-up steps and the
 * intro slides have no recording — they change with the language and with
 * what was typed — so this gives him a clock to say them by: one that starts
 * when the line does, runs for as long as the line would take to say, and
 * then stops. The character reads it on every frame as it would a player,
 * so the same lip-sync moves his mouth, with no sound.
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
  /** names the line, so the character works out a new timeline for each one, even one with the same words */
  source: string | null;
}

/**
 * Says `text` from the moment it is given, and again each time it changes;
 * said to the end, or until `speak` goes false (the screen lost focus, or
 * motion is turned down), the mouth rests. Null text says nothing.
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
    // a little after the last sound, so the mouth comes to rest before the frames stop
    const done = setTimeout(() => setSaid((now) => (now?.source === source ? { ...now, playing: false } : now)), line.durationMs + 80);
    return () => clearTimeout(done);
  }, [text, speak]);

  return said ? { player: said.line, playing: said.playing, source: said.source } : { player: null, playing: false, source: null };
}
