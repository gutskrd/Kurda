import type { AlphabetClip } from '../alphabet-audio.js';
import { WORD_CLIPS } from './clips.js';
import { CALENDAR_MONTHS, WORD_SET_IDS, wordIn, wordSet, type Dialect, type SetWord } from './words.js';

/**
 * Where each word in the word sets plays from, on the website and the phone, the way alphabet/sounds.ts does it. A word's
 * sound is filed under `words:<set>:<kmr|ckb>:<id>` and recorded in the admin panel's alphabet studio; until then a
 * synthesised clip plays where one exists (`clips.ts`, served from `/audio/words/`), and a word with neither has no play
 * button. A word said the same way twice in a set (Kurmancî's Gulan, a month on both calendars) is recorded once, under
 * its first key.
 */

/** Where the synthesised clips are on the website. */
export const SYNTHESISED_WORDS_PATH = '/audio/words/';

const PREFIX = 'words:';

/** What the recorder is told about a word, beside the word itself. */
function hintOf(word: SetWord): string {
  switch (word.set) {
    case 'colours':
      return `the colour ${word.meaning.en}`;
    case 'numbers':
      return `the number ${word.value}`;
    case 'days':
      return word.meaning.en;
    case 'months':
      return word.calendar === 'gregorian'
        ? `${word.meaning.en}, on the calendar`
        : `the Kurdish month from ${word.from.day} ${CALENDAR_MONTHS[word.from.month - 1]!.meaning.en}`;
  }
}

/** What the page shows a recorder the word as: its colour, digits or meaning in English. */
function shownAs(word: SetWord): string {
  if (word.set === 'numbers') return String(word.value);
  if (word.set === 'months' && word.calendar === 'kurdish') return `Kurdish month ${word.number}`;
  return word.meaning.en;
}

const firstKey = new Map<string, string>();
const clips: AlphabetClip[] = [];
for (const set of WORD_SET_IDS) {
  for (const dialect of ['kmr', 'ckb'] as const) {
    for (const word of wordSet(set)) {
      const say = wordIn(word, dialect);
      const same = `${set}|${dialect}|${say}`;
      if (firstKey.has(same)) continue;
      const key = `${PREFIX}${set}:${dialect}:${word.id}`;
      firstKey.set(same, key);
      const hint = hintOf(word);
      clips.push({ key, group: set, letter: shownAs(word), say, script: dialect, hint: dialect === 'ckb' ? `${word.ckbLatin} — ${hint}` : hint });
    }
  }
}

/** Every word's sound, set by set and Kurmancî before Soranî, in the shape of the alphabet's list to record (ALPHABET_CLIPS). */
export const WORD_SET_CLIPS: readonly AlphabetClip[] = clips;

const KEYS = new Set(clips.map((c) => c.key));

export function isWordSetClipKey(key: string): boolean {
  return KEYS.has(key);
}

/** The key a word's sound is filed under in a dialect: its clip's, its recording's and its speaker's. */
export function wordClipKey(word: SetWord, dialect: Dialect): string {
  return firstKey.get(`${word.set}|${dialect}|${wordIn(word, dialect)}`)!;
}

export interface WordSetSounds {
  /** where the sound filed under `key` plays from; null when it has none */
  url: (key: string | null) => string | null;
  /** where a word plays from in a dialect; null when it has no sound yet */
  of: (word: SetWord, dialect: Dialect) => string | null;
  /** true for a synthesised clip, so a page can say so — and only then */
  isSynthesised: (src: string | null) => boolean;
}

/**
 * The words' sounds, with `recorded` (from `wordSetRecordings`) in place of their synthesised clips, and those clips found
 * under `base`: the website's own path, or the same path on the website's address for the phone.
 */
export function wordSetSounds(recorded: Readonly<Record<string, string>> = {}, base: string = SYNTHESISED_WORDS_PATH): WordSetSounds {
  const url = (key: string | null): string | null => {
    if (!key) return null;
    if (Object.hasOwn(recorded, key)) return recorded[key]!;
    return Object.hasOwn(WORD_CLIPS, key) ? base + WORD_CLIPS[key] : null;
  };
  return {
    url,
    of: (word, dialect) => url(wordClipKey(word, dialect)),
    isSynthesised: (src) => !!src && src.startsWith(base),
  };
}

/** The word sets' recordings in a GET /alphabet/audio answer worth playing: https URLs under the words' keys. */
export function wordSetRecordings(clips: unknown): Record<string, string> {
  if (!clips || typeof clips !== 'object') return {};
  return Object.fromEntries(
    Object.entries(clips).filter((e): e is [string, string] => KEYS.has(e[0]) && typeof e[1] === 'string' && e[1].startsWith('https://')),
  );
}
