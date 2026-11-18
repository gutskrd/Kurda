import { ALPHABET_CLIPS } from '../alphabet-audio.js';
import { CLIPS } from './clips.js';
import type { SoraniLetter } from './letters.js';

/**
 * Where each sound on the alphabet pages plays from, on the website and the phone. Every sound has a synthesised MP3
 * (`clips.ts`, served from `/audio/alphabet/` on the website's origin) until a recording made in the admin panel replaces
 * it for its key (GET /alphabet/audio lists them). A key with no clip answers null and gets no play button: a sound that
 * could not be made accurately is left out rather than guessed.
 */

/** Where the synthesised clips are on the website. */
export const SYNTHESISED_ALPHABET_PATH = '/audio/alphabet/';

/** The key a letter's sound is filed under: its clip's, its recording's and its speaker's. */
export const latinSoundKey = (id: string): string => `kmr:sound:${id}`;
export const latinWordKey = (id: string): string => `kmr:word:${id}`;
export const pairWordKey = (word: string): string => `pair:${word}`;
export const soraniWordKey = (letter: SoraniLetter): string => `ckb:word:${letter.id}`;

/** A Soranî letter's sound: its own where only Soranî has one, else its Kurmancî partner's — the same sound. */
export function soraniSoundKey(letter: SoraniLetter): string | null {
  const own = `ckb:sound:${letter.id}`;
  if (Object.hasOwn(CLIPS, own)) return own;
  return letter.latin ? latinSoundKey(letter.latin) : null;
}

export interface AlphabetSounds {
  /** where the sound filed under `key` plays from; null when it has none */
  url: (key: string | null) => string | null;
  latinSound: (id: string) => string | null;
  latinWord: (id: string) => string | null;
  pairWord: (word: string) => string | null;
  soraniSound: (letter: SoraniLetter) => string | null;
  soraniWord: (letter: SoraniLetter) => string | null;
  /** true for a synthesised clip, so a page can say so — and only then */
  isSynthesised: (src: string | null) => boolean;
}

/**
 * The sounds, with `recorded` (from `alphabetRecordings`) in place of their synthesised clips, and those clips found under
 * `base`: the website's own path, or the same path on the website's address for the phone.
 */
export function alphabetSounds(
  recorded: Readonly<Record<string, string>> = {},
  base: string = SYNTHESISED_ALPHABET_PATH,
): AlphabetSounds {
  const url = (key: string | null): string | null => {
    if (!key) return null;
    if (Object.hasOwn(recorded, key)) return recorded[key]!;
    return Object.hasOwn(CLIPS, key) ? base + CLIPS[key] : null;
  };
  return {
    url,
    latinSound: (id) => url(latinSoundKey(id)),
    latinWord: (id) => url(latinWordKey(id)),
    pairWord: (word) => url(pairWordKey(word)),
    soraniSound: (letter) => url(soraniSoundKey(letter)),
    soraniWord: (letter) => url(soraniWordKey(letter)),
    isSynthesised: (src) => !!src && src.startsWith(base),
  };
}

/** The recordings in a GET /alphabet/audio answer worth playing: https URLs under keys the pages know. */
export function alphabetRecordings(clips: unknown): Record<string, string> {
  if (!clips || typeof clips !== 'object') return {};
  return Object.fromEntries(
    Object.entries(clips).filter(
      (e): e is [string, string] => Object.hasOwn(CLIPS, e[0]) && typeof e[1] === 'string' && e[1].startsWith('https://'),
    ),
  );
}

const SAID = new Map(ALPHABET_CLIPS.map((clip) => [clip.key, clip.say]));

/** What the recording under `key` says as read into the microphone ("ba" for b, a word for a word), for the mouth to follow without a timeline. */
export function alphabetClipText(key: string): string | null {
  return SAID.get(key) ?? null;
}
