import { lessonAudioKey, storySentences, type RecordingVoice } from '@kurda/shared';
import { knownVoice, type PlaybackClock } from '../characters/voice';

/**
 * Listening to a story: the recorded sentences, one after another.
 *
 * The audio studio records a story sentence by sentence (the same split
 * `storySentences` makes here), so a paragraph is heard as a queue of short
 * recordings. A paragraph with recordings gets a Listen button that plays its
 * own; a story with every sentence recorded also gets the whole-story bar —
 * play and pause, the sentence before and after, normal or slower speed.
 * Nothing plays from tapping the text itself: a tap on a word opens its
 * meaning, and a tap that also started sound would be two things at once.
 *
 * The player is passed in, so the queue's rules run in a test without audio.
 */

export interface NarrationItem {
  paragraph: number;
  /** index into storySentences(paragraph), which is what the reader highlights */
  sentence: number;
  url: string;
}

/** Every recorded sentence of the story, in reading order. */
export function narrationItems(paragraphs: readonly string[], audio: Readonly<Record<string, string>>): NarrationItem[] {
  const items: NarrationItem[] = [];
  paragraphs.forEach((p, paragraph) => {
    storySentences(p).forEach((s, sentence) => {
      const key = lessonAudioKey(s);
      const url = key ? audio[key] : undefined;
      if (url) items.push({ paragraph, sentence, url });
    });
  });
  return items;
}

/**
 * What a recorded sentence says, and who says it when an editor has chosen a
 * character for it (`voices` is keyed like `audio`, by `lessonAudioKey`).
 */
export function narrationLine(
  paragraphs: readonly string[],
  voices: Readonly<Record<string, RecordingVoice>> | undefined,
  item: NarrationItem,
): { text: string; voice: RecordingVoice | null } {
  const text = storySentences(paragraphs[item.paragraph] ?? '')[item.sentence] ?? '';
  const key = text ? lessonAudioKey(text) : '';
  return { text, voice: key && voices && Object.hasOwn(voices, key) ? knownVoice(voices[key]) : null };
}

/** A small surface of an audio player: what the queue needs and nothing more. */
export interface PlayerLike {
  load(url: string): void;
  play(): void;
  pause(): void;
  setRate(rate: number): void;
  /** called when the loaded recording plays to its end */
  onEnded(listener: () => void): () => void;
  release(): void;
  /** where the loaded recording is, for a speaking character to follow */
  readonly clock?: PlaybackClock;
}

export type NarrationScope = 'paragraph' | 'story';

export interface NarrationState {
  playing: boolean;
  current: NarrationItem | null;
  /** what is being played: one paragraph's Listen, or the whole-story bar */
  scope: NarrationScope | null;
  /** the paragraph whose Listen started it (scope 'paragraph') */
  paragraph: number | null;
  index: number;
  total: number;
}

export const IDLE: NarrationState = { playing: false, current: null, scope: null, paragraph: null, index: 0, total: 0 };

export class Narrator {
  private player: PlayerLike | null = null;
  private unsubscribe: (() => void) | null = null;
  private queue: NarrationItem[] = [];
  private index = 0;
  private scope: NarrationScope | null = null;
  private paragraph: number | null = null;
  private playing = false;
  private rate = 1;

  constructor(
    private readonly createPlayer: () => PlayerLike,
    private readonly onChange: (state: NarrationState) => void,
  ) {}

  /** the player's clock once there is a player; a character reads it while a sentence plays */
  get clock(): PlaybackClock | null {
    return this.player?.clock ?? null;
  }

  get state(): NarrationState {
    const current = this.scope ? (this.queue[this.index] ?? null) : null;
    return {
      playing: this.playing,
      current,
      scope: this.scope,
      paragraph: this.paragraph,
      index: this.index,
      total: this.queue.length,
    };
  }

  /** Play these from `start`: a paragraph's sentences, or the whole story. */
  play(items: readonly NarrationItem[], scope: NarrationScope, start = 0): void {
    if (items.length === 0) return;
    this.queue = [...items];
    this.scope = scope;
    this.paragraph = scope === 'paragraph' ? (items[0]?.paragraph ?? null) : null;
    this.index = Math.max(0, Math.min(start, items.length - 1));
    this.startCurrent();
  }

  /** Pause, or carry on from the sentence it paused in. */
  toggle(): void {
    if (!this.scope) return;
    const p = this.ensurePlayer();
    if (this.playing) p.pause();
    else p.play();
    this.playing = !this.playing;
    this.emit();
  }

  next(): void {
    if (!this.scope || this.index >= this.queue.length - 1) return;
    this.index += 1;
    this.startCurrent();
  }

  previous(): void {
    if (!this.scope) return;
    this.index = Math.max(0, this.index - 1);
    this.startCurrent();
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.player?.setRate(rate);
  }

  /** Silence, and forget the queue: questions started, the screen closed. */
  stop(): void {
    this.player?.pause();
    this.queue = [];
    this.index = 0;
    this.scope = null;
    this.paragraph = null;
    this.playing = false;
    this.emit();
  }

  /** The screen is gone: let the player go too. */
  dispose(): void {
    this.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.player?.release();
    this.player = null;
  }

  private ensurePlayer(): PlayerLike {
    if (!this.player) {
      this.player = this.createPlayer();
      this.player.setRate(this.rate);
      this.unsubscribe = this.player.onEnded(() => this.ended());
    }
    return this.player;
  }

  private startCurrent(): void {
    const item = this.queue[this.index];
    if (!item) return;
    const p = this.ensurePlayer();
    p.load(item.url);
    p.setRate(this.rate);
    p.play();
    this.playing = true;
    this.emit();
  }

  private ended(): void {
    if (!this.scope) return;
    if (this.index < this.queue.length - 1) {
      this.index += 1;
      this.startCurrent();
      return;
    }
    // the last sentence ended: done, and the highlight goes
    this.stop();
  }

  private emit(): void {
    this.onChange(this.state);
  }
}
