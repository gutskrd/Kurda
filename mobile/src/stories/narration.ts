import { lessonAudioKey, storySentences, type RecordingVoice, type StoryNarration } from '@kurda/shared';
import { knownVoice, type PlaybackClock } from '../characters/voice';

/**
 * Listening to a story: the recorded sentences, one after another.
 *
 * The audio studio records a story sentence by sentence (the same split
 * `storySentences` makes here), so a paragraph is heard as a queue of short
 * recordings. A paragraph with recordings gets a Listen button that plays its
 * own; a story with recordings also gets the player bar — play and pause,
 * the sentence before and after, a seek line over the whole story as one
 * stitched track (the server's `narration`, each sentence with where it
 * starts), the speed, and the sentence being read lit up in the text (a tap
 * on it says it again). Nothing plays from tapping the rest of the text: a
 * tap on a word opens its meaning, and a tap that also started sound would be
 * two things at once.
 *
 * The player is passed in, so the queue's rules run in a test without audio.
 */

export interface NarrationItem {
  paragraph: number;
  /** index into storySentences(paragraph), which is what the reader highlights */
  sentence: number;
  url: string;
  /** its recording key (also its key in the story's `voices`), when the item came from the server's track */
  key?: string;
  /** where it starts on the stitched track, and how long it runs; a paragraph's own queue has neither */
  startMs?: number;
  durationMs?: number;
}

/** Every recorded sentence of the story, in reading order. */
export function narrationItems(paragraphs: readonly string[], audio: Readonly<Record<string, string>>): NarrationItem[] {
  const items: NarrationItem[] = [];
  paragraphs.forEach((p, paragraph) => {
    storySentences(p).forEach((s, sentence) => {
      const key = lessonAudioKey(s);
      const url = key ? audio[key] : undefined;
      if (url) items.push({ paragraph, sentence, url, key });
    });
  });
  return items;
}

/** The server's stitched track as the narrator's queue: each sentence with its place on the timeline. */
export function narrationTrack(narration: StoryNarration): NarrationItem[] {
  return narration.sentences.map((s) => ({ paragraph: s.paragraph, sentence: s.sentence, url: s.url, key: s.key, startMs: s.startMs, durationMs: s.durationMs }));
}

/**
 * Which item of a queue plays at `ms` on its track, and how far into it: the
 * same rule as the shared `narrationAt`, on the narrator's own items. Before
 * the start it is the first from the beginning; at or past the end the last
 * at its end, so a seek to either edge lands somewhere playable.
 */
export function trackAt(items: readonly NarrationItem[], ms: number): { index: number; offsetMs: number } {
  if (items.length === 0) return { index: -1, offsetMs: 0 };
  if (ms <= 0) return { index: 0, offsetMs: 0 };
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    const start = item.startMs ?? 0;
    const length = item.durationMs ?? 0;
    if (ms < start + length) return { index: i, offsetMs: Math.max(0, ms - start) };
  }
  const last = items[items.length - 1]!;
  return { index: items.length - 1, offsetMs: last.durationMs ?? 0 };
}

/** How long a queue runs: the end of its last item. */
export function trackLength(items: readonly NarrationItem[]): number {
  const last = items[items.length - 1];
  return last ? (last.startMs ?? 0) + (last.durationMs ?? 0) : 0;
}

/** "m:ss" for a time on the track. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
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
  const key = item.key ?? (text ? lessonAudioKey(text) : '');
  return { text, voice: key && voices && Object.hasOwn(voices, key) ? knownVoice(voices[key]) : null };
}

/** What the player says of itself between the sentences: waiting for sound, or unable to make it. */
export interface PlayerStatus {
  buffering: boolean;
  error: boolean;
}

/** A small surface of an audio player: what the queue needs and nothing more. */
export interface PlayerLike {
  load(url: string): void;
  play(): void;
  pause(): void;
  /** to a point inside the loaded recording, in seconds */
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** called when the loaded recording plays to its end */
  onEnded(listener: () => void): () => void;
  /** called as the player waits for sound, has it again, or gives up on it */
  onStatus?(listener: (status: PlayerStatus) => void): () => void;
  release(): void;
  /** where the loaded recording is, for a speaking character to follow and the seek line to read */
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
  /** waiting for the recording's sound */
  buffering: boolean;
  /** the recording would not play */
  error: boolean;
  rate: number;
}

export const IDLE: NarrationState = { playing: false, current: null, scope: null, paragraph: null, index: 0, total: 0, buffering: false, error: false, rate: 1 };

export class Narrator {
  private player: PlayerLike | null = null;
  private unsubscribe: (() => void) | null = null;
  private queue: NarrationItem[] = [];
  private index = 0;
  private scope: NarrationScope | null = null;
  private paragraph: number | null = null;
  private playing = false;
  private rate = 1;
  private buffering = false;
  private error = false;
  /** where on the story's track it stood when last stopped part-way; null when it never played or played to its end */
  private resume: number | null = null;

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
      buffering: this.buffering,
      error: this.error,
      rate: this.rate,
    };
  }

  /** How long the queue runs, on its track. */
  get totalMs(): number {
    return trackLength(this.queue);
  }

  /**
   * Where the whole story stood when it was last stopped before its end — a
   * paragraph's Listen taking over, the reader closed — so the bar goes on
   * from inside that sentence rather than from the first one.
   */
  get resumeMs(): number | null {
    return this.resume;
  }

  /** Where on the stitched track the sound is now: the sentence's start plus how far into it the player is. */
  positionMs(): number {
    const item = this.scope ? this.queue[this.index] : undefined;
    if (!item) return 0;
    const into = Math.max(0, (this.player?.clock?.currentTime ?? 0) * 1000);
    const length = item.durationMs ?? 0;
    return (item.startMs ?? 0) + (length > 0 ? Math.min(into, length) : into);
  }

  /** Play these from `start`: a paragraph's sentences, or the whole story. */
  play(items: readonly NarrationItem[], scope: NarrationScope, start = 0): void {
    if (items.length === 0) return;
    // a new story queue starts where it is told to; a paragraph's leaves the story's place alone
    if (scope === 'story') this.resume = null;
    else this.keepPlace();
    this.queue = [...items];
    this.scope = scope;
    this.paragraph = scope === 'paragraph' ? (items[0]?.paragraph ?? null) : null;
    this.index = Math.max(0, Math.min(start, items.length - 1));
    this.startCurrent();
  }

  /** Pause, or carry on from where it paused inside the sentence. */
  toggle(): void {
    if (!this.scope) return;
    const p = this.ensurePlayer();
    if (this.playing) p.pause();
    else {
      // a sentence that would not play is asked for again from its start
      if (this.error) {
        this.startCurrent();
        return;
      }
      p.play();
    }
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

  /** The sentence being read, from its start again. */
  replay(): void {
    if (!this.scope) return;
    this.startCurrent();
  }

  /**
   * To a point on the stitched track: the sentence there is loaded if it is
   * not the one playing, and the sound moves to the point inside it. Paused
   * stays paused — the seek line moves, the voice waits.
   */
  seek(ms: number): void {
    if (!this.scope || this.queue.length === 0) return;
    const at = trackAt(this.queue, ms);
    if (at.index < 0) return;
    const p = this.ensurePlayer();
    const resume = this.playing;
    if (at.index !== this.index || this.error) {
      this.index = at.index;
      this.error = false;
      p.load(this.queue[this.index]!.url);
      p.setRate(this.rate);
    }
    p.seek(at.offsetMs / 1000);
    if (resume) p.play();
    this.emit();
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.player?.setRate(rate);
    this.emit();
  }

  /** Silence, and forget the queue: questions started, the screen closed. The story's place is kept. */
  stop(): void {
    this.keepPlace();
    this.player?.pause();
    this.queue = [];
    this.index = 0;
    this.scope = null;
    this.paragraph = null;
    this.playing = false;
    this.buffering = false;
    this.error = false;
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
      const offEnded = this.player.onEnded(() => this.ended());
      const offStatus = this.player.onStatus?.((status) => this.status(status));
      this.unsubscribe = () => {
        offEnded();
        offStatus?.();
      };
    }
    return this.player;
  }

  private startCurrent(): void {
    const item = this.queue[this.index];
    if (!item) return;
    const p = this.ensurePlayer();
    this.error = false;
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
    // the last sentence ended: done, the highlight goes, and the next play starts the story again
    this.stop();
    this.resume = null;
  }

  /** The story queue's place on its track, kept before the queue goes; only a track with times has one. */
  private keepPlace(): void {
    const item = this.queue[this.index];
    if (this.scope === 'story' && item && item.startMs !== undefined) this.resume = this.positionMs();
  }

  private status(status: PlayerStatus): void {
    if (!this.scope) return;
    const was = { buffering: this.buffering, error: this.error, playing: this.playing };
    // a recording that failed is not waiting for anything any more
    this.buffering = status.buffering && !status.error;
    if (status.error) {
      // the sound stopped on its own; the text stays readable and the bar says why.
      // The error is cleared by the next sentence loaded or by play, never by a
      // later quiet status: the player keeps reporting while the bar says it.
      this.error = true;
      this.playing = false;
    }
    if (was.buffering !== this.buffering || was.error !== this.error || was.playing !== this.playing) this.emit();
  }

  private emit(): void {
    this.onChange(this.state);
  }
}
