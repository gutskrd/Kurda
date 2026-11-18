import { lessonAudioKey, storySentences, type RecordingVoice, type StoryNarration } from '@kurda/shared';
import { knownVoice, type PlaybackClock } from '../characters/voice';

/**
 * Listening to a story as a queue of recorded sentences (split as `storySentences` does). A paragraph with
 * recordings gets its own Listen; a story with recordings also gets the player bar, which treats the whole story as
 * one stitched track (the server's `narration`). Tapping text never plays sound, since a tap on a word opens its
 * meaning. The player is injected, so the queue's rules are tested without audio.
 */

export interface NarrationItem {
  paragraph: number;
  /** Index into storySentences(paragraph), which the reader highlights. */
  sentence: number;
  url: string;
  /** Its recording key (also its key in the story's `voices`), for items from the server's track. */
  key?: string;
  /** Where it starts on the stitched track and how long it runs; a paragraph's own queue has neither. */
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

/** The server's stitched track as the narrator's queue, each sentence with its place on the timeline. */
export function narrationTrack(narration: StoryNarration): NarrationItem[] {
  return narration.sentences.map((s) => ({ paragraph: s.paragraph, sentence: s.sentence, url: s.url, key: s.key, startMs: s.startMs, durationMs: s.durationMs }));
}

/**
 * Which item plays at `ms` on the track, and the offset into it, by the same rule as shared `narrationAt`. Before
 * the start it is the first item; at or past the end the last at its end, so seeking to either edge lands somewhere
 * playable.
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

/** A recorded sentence's text, and its speaker when an editor chose a character (`voices` is keyed like `audio`, by `lessonAudioKey`). */
export function narrationLine(
  paragraphs: readonly string[],
  voices: Readonly<Record<string, RecordingVoice>> | undefined,
  item: NarrationItem,
): { text: string; voice: RecordingVoice | null } {
  const text = storySentences(paragraphs[item.paragraph] ?? '')[item.sentence] ?? '';
  const key = item.key ?? (text ? lessonAudioKey(text) : '');
  return { text, voice: key && voices && Object.hasOwn(voices, key) ? knownVoice(voices[key]) : null };
}

/** The player's state between sentences: waiting for sound, or unable to play. */
export interface PlayerStatus {
  buffering: boolean;
  error: boolean;
}

/** The small audio player interface the queue needs. */
export interface PlayerLike {
  load(url: string): void;
  play(): void;
  pause(): void;
  /** Seeks within the loaded recording, in seconds. */
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** Called when the loaded recording plays to its end. */
  onEnded(listener: () => void): () => void;
  /** Called as the player waits for sound, has it again, or gives up. */
  onStatus?(listener: (status: PlayerStatus) => void): () => void;
  release(): void;
  /** The loaded recording's position, for a speaking character and the seek line. */
  readonly clock?: PlaybackClock;
}

type NarrationScope = 'paragraph' | 'story';

export interface NarrationState {
  playing: boolean;
  current: NarrationItem | null;
  /** What is playing: one paragraph's Listen, or the whole-story bar. */
  scope: NarrationScope | null;
  /** The paragraph whose Listen started it (scope 'paragraph'). */
  paragraph: number | null;
  index: number;
  total: number;
  /** Waiting for the recording's sound. */
  buffering: boolean;
  /** The recording would not play. */
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
  /** Where on the story's track it stopped part-way; null when it never played or played to the end. */
  private resume: number | null = null;

  constructor(
    private readonly createPlayer: () => PlayerLike,
    private readonly onChange: (state: NarrationState) => void,
  ) {}

  /** The player's clock once there is a player; a character reads it while a sentence plays. */
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

  /** Where the story stopped before its end (a paragraph's Listen took over, the reader closed), so the bar resumes inside that sentence. */
  get resumeMs(): number | null {
    return this.resume;
  }

  /** The current position on the stitched track: the sentence's start plus the player's offset into it. */
  positionMs(): number {
    const item = this.scope ? this.queue[this.index] : undefined;
    if (!item) return 0;
    const into = Math.max(0, (this.player?.clock?.currentTime ?? 0) * 1000);
    const length = item.durationMs ?? 0;
    return (item.startMs ?? 0) + (length > 0 ? Math.min(into, length) : into);
  }

  /** Plays these from `start`: a paragraph's sentences, or the whole story. */
  play(items: readonly NarrationItem[], scope: NarrationScope, start = 0): void {
    if (items.length === 0) return;
    // A new story queue starts where told; a paragraph's queue leaves the story's place alone.
    if (scope === 'story') this.resume = null;
    else this.keepPlace();
    this.queue = [...items];
    this.scope = scope;
    this.paragraph = scope === 'paragraph' ? (items[0]?.paragraph ?? null) : null;
    this.index = Math.max(0, Math.min(start, items.length - 1));
    this.startCurrent();
  }

  /** Pauses, or resumes from inside the sentence. */
  toggle(): void {
    if (!this.scope) return;
    const p = this.ensurePlayer();
    if (this.playing) p.pause();
    else {
      // A sentence that failed is requested again from its start.
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

  /** Replays the current sentence from its start. */
  replay(): void {
    if (!this.scope) return;
    this.startCurrent();
  }

  /** Seeks on the stitched track, loading the sentence there if it is not the current one. A paused player stays paused. */
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

  /** Silences and forgets the queue (questions started, screen closed), keeping the story's place. */
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

  /** Releases the player when the screen is gone. */
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
    // The last sentence ended: done, the highlight goes, and the next play starts the story over.
    this.stop();
    this.resume = null;
  }

  /** Keeps the story queue's track position before the queue goes; only a timed track has one. */
  private keepPlace(): void {
    const item = this.queue[this.index];
    if (this.scope === 'story' && item && item.startMs !== undefined) this.resume = this.positionMs();
  }

  private status(status: PlayerStatus): void {
    if (!this.scope) return;
    const was = { buffering: this.buffering, error: this.error, playing: this.playing };
    // A failed recording is no longer waiting for anything.
    this.buffering = status.buffering && !status.error;
    if (status.error) {
      // The sound stopped by itself; the text stays readable and the bar says why. The error clears only with the next
      // sentence loaded or play, never with a later quiet status, since the player keeps reporting meanwhile.
      this.error = true;
      this.playing = false;
    }
    if (was.buffering !== this.buffering || was.error !== this.error || was.playing !== this.playing) this.emit();
  }

  private emit(): void {
    this.onChange(this.state);
  }
}
