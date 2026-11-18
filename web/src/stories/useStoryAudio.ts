import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lessonAudioKey, narrationAt, storyAudioSentences, storySentences, type RecordingVoice, type StoryNarration } from '@kurda/shared';
import { onBuffering, onEnded, onError, onPlaying, onTime, play, position as playerPosition, resume, setRate, stop } from '../lib/sound';

/** One recorded sentence, where it is in the story and on the stitched timeline. */
export interface AudioSentence {
  paragraph: number;
  /** Index into `storySentences(paragraph)`. */
  sentence: number;
  url: string;
  text: string;
  /** Who says it, when an editor chose a character. */
  voice?: RecordingVoice;
  /** Its length; with `startMs` its place on the stitched timeline. 0 when the server sent no timing. */
  durationMs: number;
  startMs: number;
}

/** What is being read aloud: the whole story, or one paragraph. */
export type AudioScope = { kind: 'story' } | { kind: 'paragraph'; paragraph: number };

/** The player's speeds, in the order its chip cycles through them. */
const PLAYBACK_RATES = [0.75, 1, 1.25] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** The next speed on the chip: 1× → 1.25× → 0.75× → 1×, so the usual speed is one press from either side. */
export function nextRate(rate: PlaybackRate): PlaybackRate {
  const at = PLAYBACK_RATES.indexOf(rate);
  return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length]!;
}

export interface StoryAudio {
  /** Every recorded sentence in reading order. */
  track: AudioSentence[];
  /** Paragraphs with at least one recording. */
  paragraphsWithAudio: Set<number>;
  /** How many sentences could be recorded, against `track.length` recorded. */
  recordable: number;
  /** The stitched timeline's length; 0 without timings, when nothing can be sought. */
  totalMs: number;
  scope: AudioScope | null;
  playing: boolean;
  /** The network is holding the current sentence up. */
  buffering: boolean;
  /** The current sentence would not play. */
  failed: boolean;
  /** The sentence being read or paused on. */
  current: { paragraph: number; sentence: number } | null;
  /** Index into `track` of the sentence being read or paused on. */
  index: number | null;
  rate: PlaybackRate;
  playParagraph: (paragraph: number) => void;
  /** Reads the whole story: on from a pause, else from the top. */
  playStory: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  /** Goes to a point on the stitched timeline and reads on. */
  seek: (ms: number) => void;
  /** Replays the current sentence from its start. */
  replay: () => void;
  setSpeed: (rate: PlaybackRate) => void;
  halt: () => void;
}

/**
 * Reads a story aloud from its recordings, sentence by sentence, through the app's one player (`lib/sound`). Nothing is
 * synthesised; unrecorded sentences are skipped. Playback stops when the screen goes or `stopWhen` turns true. `voices`
 * names who says each recording. With `narration`, the server's stitched timeline, the bar shows times, can seek, and a
 * pause keeps its place mid-sentence; without it the track plays the same with no seek line.
 */
export function useStoryAudio(
  paragraphs: readonly string[],
  audio: Readonly<Record<string, string>>,
  voices?: Readonly<Record<string, RecordingVoice>>,
  stopWhen = false,
  narration?: StoryNarration | null,
): StoryAudio {
  const track = useMemo<AudioSentence[]>(() => {
    if (narration) {
      return narration.sentences.map((s) => {
        const text = storySentences(paragraphs[s.paragraph] ?? '')[s.sentence] ?? '';
        const voice = voices?.[s.key];
        return { paragraph: s.paragraph, sentence: s.sentence, url: s.url, text, durationMs: s.durationMs, startMs: s.startMs, ...(voice ? { voice } : {}) };
      });
    }
    const out: AudioSentence[] = [];
    paragraphs.forEach((p, paragraph) => {
      storySentences(p).forEach((s, sentence) => {
        const key = lessonAudioKey(s);
        const url = key ? audio[key] : undefined;
        const voice = key ? voices?.[key] : undefined;
        if (url) out.push({ paragraph, sentence, url, text: s, durationMs: 0, startMs: 0, ...(voice ? { voice } : {}) });
      });
    });
    return out;
  }, [paragraphs, audio, voices, narration]);
  const paragraphsWithAudio = useMemo(() => new Set(track.map((t) => t.paragraph)), [track]);
  const recordable = useMemo(() => paragraphs.reduce((n, p) => n + storyAudioSentences(p).length, 0), [paragraphs]);
  const totalMs = narration?.totalMs ?? 0;

  const [scope, setScope] = useState<AudioScope | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRateState] = useState<PlaybackRate>(1);

  // Callbacks read the latest of these without being rebuilt every sentence.
  const live = useRef({ scope, position, rate, track });
  live.current = { scope, position, rate, track };

  const inScope = useCallback((i: number, s: AudioScope | null): boolean => {
    const item = live.current.track[i];
    if (!item || !s) return false;
    return s.kind === 'story' || item.paragraph === s.paragraph;
  }, []);

  const start = useCallback((i: number, s: AudioScope, fromMs = 0) => {
    const item = live.current.track[i];
    if (!item) return;
    // Player events can arrive before React re-renders, and must already see this sentence.
    live.current = { ...live.current, scope: s, position: i };
    setScope(s);
    setPosition(i);
    setPlaying(true);
    setFailed(false);
    setBuffering(false);
    play(item.url, live.current.rate, fromMs);
  }, []);

  const halt = useCallback(() => {
    if (live.current.position !== null) stop();
    live.current = { ...live.current, scope: null, position: null };
    setPlaying(false);
    setScope(null);
    setPosition(null);
    setBuffering(false);
  }, []);

  // A sentence ended: the next in the same scope, or the end.
  useEffect(
    () =>
      onEnded((src) => {
        const { position: at, scope: s, track: tr } = live.current;
        if (at === null || !s || tr[at]?.url !== src) return;
        const nextAt = at + 1;
        if (inScope(nextAt, s)) start(nextAt, s);
        else {
          setPlaying(false);
          setScope(null);
          setPosition(null);
        }
      }),
    [inScope, start],
  );

  // Something else took the player (a letter, another paragraph's button): let go.
  useEffect(
    () =>
      onPlaying((src) => {
        const { position: at, track: tr } = live.current;
        if (src !== null && at !== null && tr[at]?.url !== src) {
          setPlaying(false);
          setScope(null);
          setPosition(null);
        }
      }),
    [],
  );

  // The network holding our sentence up, or losing it.
  useEffect(
    () =>
      onBuffering((src, waiting) => {
        const { position: at, track: tr } = live.current;
        if (at !== null && tr[at]?.url === src) setBuffering(waiting);
      }),
    [],
  );
  useEffect(
    () =>
      onError((src) => {
        const { position: at, track: tr } = live.current;
        if (at === null || tr[at]?.url !== src) return;
        setFailed(true);
        setBuffering(false);
        setPlaying(false);
      }),
    [],
  );

  // Leaving the screen, or the questions starting, ends the reading.
  useEffect(() => () => {
    if (live.current.position !== null) stop();
  }, []);
  useEffect(() => {
    if (stopWhen) halt();
  }, [stopWhen, halt]);

  const playParagraph = useCallback(
    (paragraph: number) => {
      const s: AudioScope = { kind: 'paragraph', paragraph };
      const first = live.current.track.findIndex((t) => t.paragraph === paragraph);
      if (first >= 0) start(first, s);
    },
    [start],
  );

  const playStory = useCallback(() => {
    const { position: at, scope: s, track: tr } = live.current;
    // Resume a paused story mid-sentence; otherwise start from the top.
    if (s?.kind === 'story' && at !== null) {
      const item = tr[at];
      if (item && resume(item.url)) {
        setPlaying(true);
        setFailed(false);
        return;
      }
      start(at, s);
      return;
    }
    start(0, { kind: 'story' });
  }, [start]);

  const pause = useCallback(() => {
    stop();
    setPlaying(false);
  }, []);

  const step = useCallback(
    (by: 1 | -1) => {
      const at = live.current.position ?? (by === 1 ? -1 : 0);
      const to = Math.min(Math.max(at + by, 0), live.current.track.length - 1);
      start(to, { kind: 'story' });
    },
    [start],
  );

  const seek = useCallback(
    (ms: number) => {
      if (!narration || narration.sentences.length === 0) return;
      const { index, offsetMs } = narrationAt(narration, ms);
      if (index < 0) return;
      start(index, { kind: 'story' }, offsetMs);
    },
    [narration, start],
  );

  const replay = useCallback(() => {
    const { position: at, scope: s } = live.current;
    if (at === null) return;
    start(at, s ?? { kind: 'story' });
  }, [start]);

  const setSpeed = useCallback((next: PlaybackRate) => {
    setRateState(next);
    setRate(next);
  }, []);

  const item = position !== null ? track[position] : undefined;
  return {
    track,
    paragraphsWithAudio,
    recordable,
    totalMs,
    scope,
    playing,
    buffering,
    failed,
    current: item ? { paragraph: item.paragraph, sentence: item.sentence } : null,
    index: position,
    rate,
    playParagraph,
    playStory,
    pause,
    previous: useCallback(() => step(-1), [step]),
    next: useCallback(() => step(1), [step]),
    seek,
    replay,
    setSpeed,
    halt,
  };
}

/**
 * The position on the stitched timeline from the player's clock. Kept out of `useStoryAudio`'s state because it changes
 * several times a second and only the bar needs it.
 */
export function useNarrationClock(audio: StoryAudio): number {
  const item = audio.index !== null ? audio.track[audio.index] : undefined;
  const url = item?.url ?? null;
  const startMs = item?.startMs ?? 0;
  const [within, setWithin] = useState(0);
  useEffect(() => {
    // A sentence started part-way (a seek) begins where it was put, before its clock ticks.
    const now = playerPosition();
    setWithin(url && now.src === url ? now.ms : 0);
    if (!url) return;
    return onTime((src, ms) => {
      if (src === url) setWithin(ms);
    });
  }, [url]);
  // An ended sentence sits at its end until the next begins.
  const cap = item ? item.durationMs || Infinity : 0;
  return item ? startMs + Math.min(within, cap) : 0;
}
