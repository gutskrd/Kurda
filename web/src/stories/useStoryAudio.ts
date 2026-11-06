import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lessonAudioKey, narrationAt, storyAudioSentences, storySentences, type RecordingVoice, type StoryNarration } from '@kurda/shared';
import { onBuffering, onEnded, onError, onPlaying, onTime, play, position as playerPosition, resume, setRate, stop } from '../lib/sound';

/** One recorded sentence, where it is in the story and on the stitched timeline. */
export interface AudioSentence {
  paragraph: number;
  /** index into `storySentences(paragraph)` */
  sentence: number;
  url: string;
  /** what it says */
  text: string;
  /** who says it, when an editor chose a character for it */
  voice?: RecordingVoice;
  /** how long it lasts, and where it starts when every recorded sentence plays in order; 0 when the server sent no timing */
  durationMs: number;
  startMs: number;
}

/** What is being read aloud: the whole story, or one paragraph. */
export type AudioScope = { kind: 'story' } | { kind: 'paragraph'; paragraph: number };

/** The speeds the player offers, in the order its chip cycles through them. */
export const PLAYBACK_RATES = [0.75, 1, 1.25] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** The speed after `rate` on the chip: 1× → 1.25× → 0.75× → 1×, so the usual speed is one press from either side. */
export function nextRate(rate: PlaybackRate): PlaybackRate {
  const at = PLAYBACK_RATES.indexOf(rate);
  return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length]!;
}

export interface StoryAudio {
  /** every recorded sentence in reading order */
  track: AudioSentence[];
  /** the paragraphs that have at least one recording */
  paragraphsWithAudio: Set<number>;
  /** how many sentences could be recorded, against `track.length` recorded ones */
  recordable: number;
  /** the stitched timeline's length; 0 when the server sent no timings, and then nothing can be sought */
  totalMs: number;
  scope: AudioScope | null;
  playing: boolean;
  /** the network is holding the current sentence up */
  buffering: boolean;
  /** the current sentence would not play */
  failed: boolean;
  /** the sentence being read (or paused on) */
  current: { paragraph: number; sentence: number } | null;
  /** index into `track` of the sentence being read (or paused on) */
  index: number | null;
  rate: PlaybackRate;
  playParagraph: (paragraph: number) => void;
  /** read the whole story: on from a pause, else from the top */
  playStory: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  /** go to a point on the stitched timeline and read on from there */
  seek: (ms: number) => void;
  /** say the current sentence again from its start */
  replay: () => void;
  setSpeed: (rate: PlaybackRate) => void;
  halt: () => void;
}

/**
 * Reading a story aloud from its studio recordings, one sentence after
 * another, through the app's one player (`lib/sound`), so a story never talks
 * over a letter or a lesson.
 *
 * Only recordings play — nothing is synthesised, and a sentence with no
 * recording is skipped, never guessed at. Nothing plays by touching the
 * text: a paragraph has its own Listen button, and a narrated story a
 * player bar. Whatever is playing stops when the screen goes, and when
 * `stopWhen` turns true (the questions starting). `voices` says who says
 * each recording, by the same keys as `audio`, for the reader to show them.
 *
 * `narration` is the server's stitched timeline (every recorded sentence
 * with its length and where it starts): with it the bar can show elapsed and
 * total and be dragged along, and a pause keeps its place in the sentence.
 * Without it (a game's copy of an older story) the track is built from the
 * recordings alone and plays the same way, only without a seek line.
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

  // the callbacks below read the latest of these without being rebuilt on every sentence
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
    // the player's events can arrive before React renders again: they must already see this sentence
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

  // one sentence ends: the next one in the same scope, or the end
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

  // something else took the player (a letter, another paragraph's button elsewhere): let go
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

  // the network holding our sentence up, or losing it
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

  // leaving the screen, or the questions starting, ends the reading
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
    // carry on from a pause in the whole story — inside the sentence, where it stopped — otherwise from the top
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
 * Where the reading is on the stitched timeline, following the player's own
 * clock: the current sentence's start plus how far into it the clip is. Kept
 * out of `useStoryAudio`'s state on purpose — it changes a few times a second,
 * and only the bar's line and numbers need to move with it, not the text.
 */
export function useNarrationClock(audio: StoryAudio): number {
  const item = audio.index !== null ? audio.track[audio.index] : undefined;
  const url = item?.url ?? null;
  const startMs = item?.startMs ?? 0;
  const [within, setWithin] = useState(0);
  useEffect(() => {
    // a sentence started part-way through (a seek) begins where it was put, before its clock has ticked
    const now = playerPosition();
    setWithin(url && now.src === url ? now.ms : 0);
    if (!url) return;
    return onTime((src, ms) => {
      if (src === url) setWithin(ms);
    });
  }, [url]);
  // a sentence that has ended sits at its end until the next begins
  const cap = item ? item.durationMs || Infinity : 0;
  return item ? startMs + Math.min(within, cap) : 0;
}
