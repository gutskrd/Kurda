import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  isAllowedQuestionCount,
  isStoryDialect,
  isStoryLength,
  isTextDuring,
  isTimerPreset,
  type QuestionCount,
  type StoryDialect,
  type StoryLength,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';

/**
 * What Stories remembers on this phone: the reader's text size, the variety
 * and length last chosen, how "Quiz yourself" is set up, whether English is
 * shown under the questions, extra time, and the narration speed.
 *
 * One small JSON value, stored the way the app's other preferences are
 * (keystore on a phone, localStorage on the web). Every read and write is
 * best-effort: a store that fails reads as the defaults, and a preference is
 * never a reason for a screen not to open.
 */

const KEY = 'hevalo_stories_prefs_v1';

/** The reader's text sizes, as a multiple of the body size (on top of the system's Dynamic Type). */
export const TEXT_SCALES = [1, 1.15, 1.3, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export const NARRATION_RATES = [1, 0.75] as const;
export type NarrationRate = (typeof NARRATION_RATES)[number];

export interface SoloQuizPrefs {
  /** per length, since the counts on offer differ */
  questionCount: Partial<Record<StoryLength, QuestionCount>>;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
}

export interface StoryPrefs {
  textScale: TextScale;
  dialect: StoryDialect | null;
  length: StoryLength | null;
  quiz: SoloQuizPrefs;
  /** null: the default — English under the question at level 1 only */
  englishUnder: boolean | null;
  extraTime: boolean;
  rate: NarrationRate;
}

export const DEFAULT_PREFS: StoryPrefs = {
  textScale: 1,
  dialect: null,
  length: null,
  quiz: { questionCount: {}, timerSeconds: 0, textDuring: 'visible' },
  englishUnder: null,
  extraTime: false,
  rate: 1,
};

/** Whatever was stored, checked field by field: anything unknown falls back to the default. */
export function parsePrefs(raw: string | null | undefined): StoryPrefs {
  if (!raw) return DEFAULT_PREFS;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return DEFAULT_PREFS;
  }
  if (!v || typeof v !== 'object') return DEFAULT_PREFS;
  const quiz = (v.quiz && typeof v.quiz === 'object' ? v.quiz : {}) as Record<string, unknown>;
  const counts: SoloQuizPrefs['questionCount'] = {};
  if (quiz.questionCount && typeof quiz.questionCount === 'object') {
    for (const [length, count] of Object.entries(quiz.questionCount as Record<string, unknown>)) {
      if (isStoryLength(length) && isAllowedQuestionCount(length, count)) counts[length] = count;
    }
  }
  return {
    textScale: (TEXT_SCALES as readonly unknown[]).includes(v.textScale) ? (v.textScale as TextScale) : 1,
    dialect: isStoryDialect(v.dialect) ? v.dialect : null,
    length: isStoryLength(v.length) ? v.length : null,
    quiz: {
      questionCount: counts,
      timerSeconds: isTimerPreset(quiz.timerSeconds) ? quiz.timerSeconds : 0,
      textDuring: isTextDuring(quiz.textDuring) ? quiz.textDuring : 'visible',
    },
    englishUnder: typeof v.englishUnder === 'boolean' ? v.englishUnder : null,
    extraTime: v.extraTime === true,
    rate: (NARRATION_RATES as readonly unknown[]).includes(v.rate) ? (v.rate as NarrationRate) : 1,
  };
}

async function read(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function write(value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // a preference is a nicety; the screen goes on with what it has
  }
}

// shared by every screen that reads them, so the reader and the setup sheet agree
let cache: StoryPrefs | null = null;
let loading: Promise<StoryPrefs> | null = null;
const listeners = new Set<(p: StoryPrefs) => void>();

export function loadPrefs(): Promise<StoryPrefs> {
  if (cache) return Promise.resolve(cache);
  loading ??= read().then((raw) => {
    cache = parsePrefs(raw);
    return cache;
  });
  return loading;
}

export function savePrefs(patch: Partial<StoryPrefs>): StoryPrefs {
  const next = { ...(cache ?? DEFAULT_PREFS), ...patch };
  cache = next;
  for (const l of [...listeners]) l(next);
  void write(JSON.stringify(next));
  return next;
}

/** For tests: forget what was loaded. */
export function resetPrefsCache(): void {
  cache = null;
  loading = null;
}

/** The preferences, and a way to change some of them; `ready` once read from the store. */
export function useStoryPrefs(): { prefs: StoryPrefs; ready: boolean; update: (patch: Partial<StoryPrefs>) => void } {
  const [prefs, setPrefs] = useState<StoryPrefs>(cache ?? DEFAULT_PREFS);
  const [ready, setReady] = useState(cache !== null);
  useEffect(() => {
    let live = true;
    listeners.add(setPrefs);
    void loadPrefs().then((p) => {
      if (!live) return;
      setPrefs(p);
      setReady(true);
    });
    return () => {
      live = false;
      listeners.delete(setPrefs);
    };
  }, []);
  const update = useCallback((patch: Partial<StoryPrefs>) => {
    savePrefs(patch);
  }, []);
  return { prefs, ready, update };
}
