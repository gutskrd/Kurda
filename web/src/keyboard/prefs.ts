import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_ACCENT_MODE, isAccentMode, isTypingDialect, type AccentMode, type TypingDialect } from '@kurda/shared';

/**
 * How this device types Kurdish: the settings the typing race, Wordle and the
 * keyboard guide share (contract §K3 — "per device").
 *
 * Per device rather than per account because they are about the keyboard in
 * front of you: the laptop may have a Kurdish layout and the borrowed one not,
 * and accents that are forgiving on one should not quietly turn strict on the
 * other. The phone app keeps the same settings under the same name.
 */
export type WordleLayout = 'qwerty' | 'alphabet';

export interface KeyboardPrefs {
  /** how the race treats e for ê; the server stores the mode with each race */
  accentMode: AccentMode;
  /** ç ê î ş û (or the Soranî letters) as keys above the race's text */
  keyBar: boolean;
  /** e then ` is ê — for a keyboard with no Kurdish layout */
  backtick: boolean;
  /** Wordle's on-screen keyboard: QWERTY, or the 31 letters in alphabet order */
  wordleLayout: WordleLayout;
  /** the variety the last race was in; null until one was chosen */
  raceDialect: TypingDialect | null;
  /** the keyboard guide has been offered before a first Kurmancî race */
  guideOffered: boolean;
  /**
   * When "Not now" was last said to the guide after a race with missed
   * accents (ms since the epoch) — it waits a while before asking again.
   */
  guideNudgeDismissedAt: number | null;
}

export const DEFAULT_KEYBOARD_PREFS: KeyboardPrefs = {
  accentMode: DEFAULT_ACCENT_MODE,
  keyBar: true,
  backtick: true,
  wordleLayout: 'qwerty',
  raceDialect: null,
  guideOffered: false,
  guideNudgeDismissedAt: null,
};

export const KEYBOARD_PREFS_KEY = 'hevalo.keyboard.v1';

/**
 * Settings read back from storage. Anything unrecognised — an older shape, a
 * value edited by hand, plain garbage — falls back to its default one field at
 * a time, so one bad field never resets the rest.
 */
export function parseKeyboardPrefs(raw: string | null | undefined): KeyboardPrefs {
  let v: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
    } catch {
      // not JSON: every field takes its default
    }
  }
  const bool = (x: unknown, fallback: boolean): boolean => (typeof x === 'boolean' ? x : fallback);
  const at = v.guideNudgeDismissedAt;
  return {
    accentMode: isAccentMode(v.accentMode) ? v.accentMode : DEFAULT_KEYBOARD_PREFS.accentMode,
    keyBar: bool(v.keyBar, DEFAULT_KEYBOARD_PREFS.keyBar),
    backtick: bool(v.backtick, DEFAULT_KEYBOARD_PREFS.backtick),
    wordleLayout: v.wordleLayout === 'alphabet' ? 'alphabet' : 'qwerty',
    raceDialect: isTypingDialect(v.raceDialect) ? v.raceDialect : null,
    guideOffered: bool(v.guideOffered, false),
    guideNudgeDismissedAt: typeof at === 'number' && Number.isFinite(at) ? at : null,
  };
}

/*
 * One copy for the whole page, so the race, its settings panel and Settings
 * show the same values the moment one of them changes — and another tab follows
 * through the `storage` event.
 *
 * Storage can be missing or refuse (a private window, a full quota, blocked
 * site data). Then the settings live in memory for this visit: they still work,
 * they are only forgotten on reload.
 */
let memory: string | null = null;
let storageBroken = false;
let snapshot: { raw: string | null; prefs: KeyboardPrefs } | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  if (storageBroken) return memory;
  try {
    return localStorage.getItem(KEYBOARD_PREFS_KEY);
  } catch {
    storageBroken = true;
    return memory;
  }
}

export function getKeyboardPrefs(): KeyboardPrefs {
  const raw = readRaw();
  if (!snapshot || snapshot.raw !== raw) snapshot = { raw, prefs: parseKeyboardPrefs(raw) };
  return snapshot.prefs;
}

export function updateKeyboardPrefs(patch: Partial<KeyboardPrefs>): KeyboardPrefs {
  const next = { ...getKeyboardPrefs(), ...patch };
  const raw = JSON.stringify(next);
  memory = raw;
  if (!storageBroken) {
    try {
      localStorage.setItem(KEYBOARD_PREFS_KEY, raw);
    } catch {
      storageBroken = true;
    }
  }
  for (const l of listeners) l();
  return getKeyboardPrefs();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === KEYBOARD_PREFS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The settings, and a way to change some of them. */
export function useKeyboardPrefs(): [KeyboardPrefs, (patch: Partial<KeyboardPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getKeyboardPrefs, getKeyboardPrefs);
  const update = useCallback((patch: Partial<KeyboardPrefs>) => {
    updateKeyboardPrefs(patch);
  }, []);
  return [prefs, update];
}

/** For tests: forget what this page remembered, as a reload would. */
export function resetKeyboardPrefsForTests(): void {
  memory = null;
  storageBroken = false;
  snapshot = null;
}
