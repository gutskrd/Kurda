import { useEffect, useState } from 'react';
import { DEFAULT_ACCENT_MODE, isAccentMode, isTypingDialect, type AccentMode, type TypingDialect } from '@kurda/shared';
import { deviceStore, type DeviceStore } from './deviceStore';

/**
 * How this device types Kurdish: settings shared by the typing race, Peyvok and the keyboard guide. Kept per
 * device, not per account, because they are about the keyboard at hand: a phone may have Kurdish (Latin)
 * installed and a laptop not.
 */
export type WordleLayout = 'qwerty' | 'alphabet';

export interface KeyboardPrefs {
  /** How the race treats e for ê; the server stores the mode with each race. */
  accentMode: AccentMode;
  /** ç ê î ş û (or the Soranî letters) as keys above the text box. */
  keyBar: boolean;
  /** E then ` is ê — for a hardware keyboard with no Kurdish layout. */
  backtick: boolean;
  /** Peyvok's on-screen keyboard: QWERTY, or the 31 letters in alphabet order. */
  wordleLayout: WordleLayout;
  /** The variety of the last race; null until one was chosen. */
  raceDialect: TypingDialect | null;
  /** The keyboard guide has opened by itself once (before a first Kurmancî race). */
  guideShown: boolean;
}

export const DEFAULT_KEYBOARD_PREFS: KeyboardPrefs = {
  accentMode: DEFAULT_ACCENT_MODE,
  keyBar: true,
  backtick: true,
  wordleLayout: 'qwerty',
  raceDialect: null,
  guideShown: false,
};

export const KEYBOARD_PREFS_KEY = 'hevalo.keyboard.v1';

/**
 * Settings read back from storage. Anything unrecognised falls back to its default field by field, so one bad
 * field never resets the rest.
 */
export function parseKeyboardPrefs(raw: string | null | undefined): KeyboardPrefs {
  let v: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
    } catch {
      // Not JSON: every field takes its default.
    }
  }
  const bool = (x: unknown, fallback: boolean): boolean => (typeof x === 'boolean' ? x : fallback);
  return {
    accentMode: isAccentMode(v.accentMode) ? v.accentMode : DEFAULT_KEYBOARD_PREFS.accentMode,
    keyBar: bool(v.keyBar, DEFAULT_KEYBOARD_PREFS.keyBar),
    backtick: bool(v.backtick, DEFAULT_KEYBOARD_PREFS.backtick),
    wordleLayout: v.wordleLayout === 'alphabet' ? 'alphabet' : 'qwerty',
    raceDialect: isTypingDialect(v.raceDialect) ? v.raceDialect : null,
    guideShown: bool(v.guideShown, false),
  };
}

type Listener = (prefs: KeyboardPrefs) => void;

/** One app-wide copy, so the race, its settings sheet and Settings show the same values the moment one changes. */
export class KeyboardPrefsStore {
  private prefs: KeyboardPrefs = DEFAULT_KEYBOARD_PREFS;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly store: DeviceStore = deviceStore) {}

  get current(): KeyboardPrefs {
    return this.prefs;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /** Read the saved settings once; later calls wait for the same read. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.store.get(KEYBOARD_PREFS_KEY).then((raw) => {
        // A change made before the read finished wins over what was saved.
        if (!this.loaded) this.prefs = parseKeyboardPrefs(raw);
        this.loaded = true;
        this.emit();
      });
    }
    return this.loading;
  }

  update(patch: Partial<KeyboardPrefs>): KeyboardPrefs {
    this.prefs = { ...this.prefs, ...patch };
    this.loaded = true;
    this.emit();
    void this.store.set(KEYBOARD_PREFS_KEY, JSON.stringify(this.prefs));
    return this.prefs;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l(this.prefs);
  }
}

export const keyboardPrefs = new KeyboardPrefsStore();

/** The settings, live, and a way to change them. */
export function useKeyboardPrefs(
  store: KeyboardPrefsStore = keyboardPrefs,
): [KeyboardPrefs, (patch: Partial<KeyboardPrefs>) => void, boolean] {
  const [prefs, setPrefs] = useState(store.current);
  const [ready, setReady] = useState(store.ready);
  useEffect(() => {
    const off = store.subscribe((p) => {
      setPrefs(p);
      setReady(true);
    });
    void store.load();
    return off;
  }, [store]);
  return [prefs, (patch) => store.update(patch), ready];
}
