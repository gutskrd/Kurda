import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lessonAudioKey, storySentences, type RecordingVoice } from '@kurda/shared';
import { onEnded, onPlaying, play, setRate, stop } from '../lib/sound';

/** One recorded sentence, where it is in the story. */
export interface AudioSentence {
  paragraph: number;
  /** index into `storySentences(paragraph)` */
  sentence: number;
  url: string;
  /** what it says */
  text: string;
  /** who says it, when an editor chose a character for it */
  voice?: RecordingVoice;
}

/** What is being read aloud: the whole story, or one paragraph. */
export type AudioScope = { kind: 'story' } | { kind: 'paragraph'; paragraph: number };

export interface StoryAudio {
  /** every recorded sentence in reading order */
  track: AudioSentence[];
  /** the paragraphs that have at least one recording */
  paragraphsWithAudio: Set<number>;
  scope: AudioScope | null;
  playing: boolean;
  /** the sentence being read (or paused on) */
  current: { paragraph: number; sentence: number } | null;
  rate: 1 | 0.75;
  playParagraph: (paragraph: number) => void;
  playStory: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  setSpeed: (rate: 1 | 0.75) => void;
  halt: () => void;
}

/**
 * Reading a story aloud from its studio recordings, one sentence after
 * another, through the app's one player (`lib/sound`), so a story never talks
 * over a letter or a lesson.
 *
 * Only recordings play — nothing is synthesised, and a sentence with no
 * recording is skipped, never guessed at. Nothing plays by touching the
 * text: a paragraph has its own Listen button, and a fully narrated story a
 * player bar. Whatever is playing stops when the screen goes, and when
 * `stopWhen` turns true (the questions starting). `voices` says who says
 * each recording, by the same keys as `audio`, for the reader to show them.
 */
export function useStoryAudio(
  paragraphs: readonly string[],
  audio: Readonly<Record<string, string>>,
  voices?: Readonly<Record<string, RecordingVoice>>,
  stopWhen = false,
): StoryAudio {
  const track = useMemo<AudioSentence[]>(() => {
    const out: AudioSentence[] = [];
    paragraphs.forEach((p, paragraph) => {
      storySentences(p).forEach((s, sentence) => {
        const key = lessonAudioKey(s);
        const url = key ? audio[key] : undefined;
        const voice = key ? voices?.[key] : undefined;
        if (url) out.push({ paragraph, sentence, url, text: s, ...(voice ? { voice } : {}) });
      });
    });
    return out;
  }, [paragraphs, audio, voices]);
  const paragraphsWithAudio = useMemo(() => new Set(track.map((t) => t.paragraph)), [track]);

  const [scope, setScope] = useState<AudioScope | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState<1 | 0.75>(1);

  // the callbacks below read the latest of these without being rebuilt on every sentence
  const live = useRef({ scope, position, rate, track });
  live.current = { scope, position, rate, track };

  const inScope = useCallback((i: number, s: AudioScope | null): boolean => {
    const item = live.current.track[i];
    if (!item || !s) return false;
    return s.kind === 'story' || item.paragraph === s.paragraph;
  }, []);

  const start = useCallback((i: number, s: AudioScope) => {
    const item = live.current.track[i];
    if (!item) return;
    // the player's events can arrive before React renders again: they must already see this sentence
    live.current = { ...live.current, scope: s, position: i };
    setScope(s);
    setPosition(i);
    setPlaying(true);
    play(item.url, live.current.rate);
  }, []);

  const halt = useCallback(() => {
    if (live.current.position !== null) stop();
    live.current = { ...live.current, scope: null, position: null };
    setPlaying(false);
    setScope(null);
    setPosition(null);
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
    const { position: at, scope: s } = live.current;
    // carry on from a pause in the whole story; otherwise from the top
    start(s?.kind === 'story' && at !== null ? at : 0, { kind: 'story' });
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

  const setSpeed = useCallback((next: 1 | 0.75) => {
    setRateState(next);
    setRate(next);
  }, []);

  const item = position !== null ? track[position] : undefined;
  return {
    track,
    paragraphsWithAudio,
    scope,
    playing,
    current: item ? { paragraph: item.paragraph, sentence: item.sentence } : null,
    rate,
    playParagraph,
    playStory,
    pause,
    previous: useCallback(() => step(-1), [step]),
    next: useCallback(() => step(1), [step]),
    setSpeed,
    halt,
  };
}
