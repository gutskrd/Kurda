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
 * What Stories remembers on this phone: text size, the chosen Kurmancî/Soranî variety (followed by the library, the
 * reader and game setup), the last length, "Quiz yourself" settings, English under questions, extra time, and
 * narration speed. One small JSON value in the app's preference store; reads and writes are best-effort, and a
 * failing store reads as the defaults.
 */

const KEY = 'hevalo_stories_prefs_v1';

/** Reader text sizes, as multiples of the body size, on top of the system's Dynamic Type. */
export const TEXT_SCALES = [1, 1.15, 1.3, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** Narration speeds, in the order the chip cycles through them. */
export const NARRATION_RATES = [0.75, 1, 1.25] as const;
export type NarrationRate = (typeof NARRATION_RATES)[number];

/** The speed after `rate` on the chip: 0.75× → 1× → 1.25× → 0.75×. */
export function nextRate(rate: NarrationRate): NarrationRate {
  const at = NARRATION_RATES.indexOf(rate);
  return NARRATION_RATES[(at + 1) % NARRATION_RATES.length] ?? 1;
}

export interface SoloQuizPrefs {
  /** Per length, since the counts on offer differ. */
  questionCount: Partial<Record<StoryLength, QuestionCount>>;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
}

interface StoryPrefs {
  textScale: TextScale;
  dialect: StoryDialect | null;
  length: StoryLength | null;
  quiz: SoloQuizPrefs;
  /** Null for the default: English under the question at level 1 only. */
  englishUnder: boolean | null;
  extraTime: boolean;
  rate: NarrationRate;
}

const DEFAULT_PREFS: StoryPrefs = {
  textScale: 1,
  dialect: null,
  length: null,
  quiz: { questionCount: {}, timerSeconds: 0, textDuring: 'visible' },
  englishUnder: null,
  extraTime: false,
  rate: 1,
};

/**
 * The variety Stories shows (library, reader switch, game setup): the last choice on this phone, else Soranî under
 * a Soranî interface and Kurmancî otherwise. Only the switch records a choice (`dialect`); opening a story of the
 * other variety from a link does not.
 */
export function shownDialect(locale: string, chosen: StoryDialect | null): StoryDialect {
  return chosen ?? (locale === 'ckb' ? 'sorani' : 'kurmanci');
}

/** Parses what was stored field by field; anything unknown falls back to the default. */
function parsePrefs(raw: string | null | undefined): StoryPrefs {
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
    // A preference is a nicety; the screen continues with what it has.
  }
}

// Shared by every screen that reads them, so the reader and the setup sheet agree.
let cache: StoryPrefs | null = null;
let loading: Promise<StoryPrefs> | null = null;
const listeners = new Set<(p: StoryPrefs) => void>();

function loadPrefs(): Promise<StoryPrefs> {
  if (cache) return Promise.resolve(cache);
  loading ??= read().then((raw) => {
    cache = parsePrefs(raw);
    return cache;
  });
  return loading;
}

function savePrefs(patch: Partial<StoryPrefs>): StoryPrefs {
  const next = { ...(cache ?? DEFAULT_PREFS), ...patch };
  cache = next;
  for (const l of [...listeners]) l(next);
  void write(JSON.stringify(next));
  return next;
}

/** For tests: forgets what was loaded. */
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
