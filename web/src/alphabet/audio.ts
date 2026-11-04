import { useEffect, useSyncExternalStore } from 'react';
import {
  alphabetClipText,
  alphabetRecordings,
  alphabetSounds,
  isSpeakerId,
  wordSetRecordings,
  wordSetSounds,
  type AlphabetAudioResponse,
  type AlphabetSounds,
  type RecordingVoice,
  type SetWord,
  type SoraniLetter,
  type WordDialect,
  type WordSetSounds,
} from '@kurda/shared';
import { spokenClips, type SpokenClip } from '../characters/clips';
import { API_URL } from '../lib/config';

/**
 * Where each sound is. The clips are files on this site (see
 * scripts/alphabet-audio/generate.py and words.py), so playing one costs a
 * few kilobytes from the edge and no request to anybody's server. Which file,
 * or which recording, a key plays is worked out in @kurda/shared
 * (alphabet/sounds.ts, word-sets/sounds.ts), the same for the phone.
 *
 * The word sets (colours, numbers, days, months) are here too: their
 * recordings come in the alphabet's own answer, GET /alphabet/audio, under
 * the words' keys, so one request serves the alphabet page and the words
 * pages alike, whichever is opened first.
 *
 * A key with no clip answers null, and the page shows no play button there:
 * a sound that could not be made accurately is left out rather than guessed.
 */

/*
 * Recordings made in the admin panel, by key. A recording wins over the
 * synthesised clip for its key; until they arrive (or if the API is asleep or
 * unreachable) the synthesised clips play, so the page never waits on them.
 */
let sounds: AlphabetSounds = alphabetSounds();
let words: WordSetSounds = wordSetSounds();
/** who says a recording, by its URL, with the words it says; only the recordings an editor gave a character */
let voices: ReadonlyMap<string, { voice: RecordingVoice; text: string | null }> = new Map();
let version = 0;
let loading: Promise<void> | null = null;
const changed = new Set<() => void>();

export function loadRecordings(): Promise<void> {
  loading ??= fetch(`${API_URL}/alphabet/audio`)
    .then((res) => (res.ok ? (res.json() as Promise<Partial<AlphabetAudioResponse>>) : { clips: {} }))
    .then(({ clips, voices: said }) => {
      // only https URLs to keys the pages know: anything else is not ours to play
      const letters = alphabetRecordings(clips);
      const spoken = wordSetRecordings(clips);
      const recorded = { ...letters, ...spoken };
      if (Object.keys(recorded).length === 0) return;
      sounds = alphabetSounds(letters);
      words = wordSetSounds(spoken);
      const heard = new Map<string, { voice: RecordingVoice; text: string | null }>();
      for (const [key, url] of Object.entries(recorded)) {
        const voice = said?.[key];
        if (voice && isSpeakerId(voice.speaker)) heard.set(url, { voice, text: alphabetClipText(key) });
      }
      voices = heard;
      version++;
      changed.forEach((f) => f());
    })
    .catch(() => undefined);
  return loading;
}

/** Re-render when the recordings arrive. Call it once, high in the page. */
export function useRecordings(): number {
  useEffect(() => void loadRecordings(), []);
  return useSyncExternalStore(
    (f) => {
      changed.add(f);
      return () => changed.delete(f);
    },
    () => version,
  );
}

/** Where every sound plays from now: for a practice round, which asks with whatever has arrived. */
export function currentSounds(): AlphabetSounds {
  return sounds;
}

/** The word sets' sounds as they stand now, for the same reason. */
export function currentWordSounds(): WordSetSounds {
  return words;
}

/** Where a word of the sets plays from in a dialect: its recording, else its synthesised clip; null when it has neither yet. */
export const wordSound = (word: SetWord, dialect: WordDialect): string | null => words.of(word, dialect);

/**
 * The recordings among `srcs` that an editor gave a character, with who says
 * each: a synthesised clip never has one.
 */
export function spokenAlphabet(...srcs: Array<string | null>): SpokenClip[] {
  return spokenClips(srcs.map((src) => ({ src, ...(src ? voices.get(src) : undefined) })));
}

/** True for a synthesised clip, a letter's or a word's, so the page can say so — and only then. */
export const isSynthesised = (src: string | null): boolean => sounds.isSynthesised(src) || words.isSynthesised(src);

export const latinSound = (id: string): string | null => sounds.latinSound(id);
export const latinWord = (id: string): string | null => sounds.latinWord(id);
export const pairWord = (word: string): string | null => sounds.pairWord(word);
/** A Soranî letter's sound: its own where only Soranî has one, else its Kurmancî partner's — the same sound. */
export const soraniSound = (l: SoraniLetter): string | null => sounds.soraniSound(l);
export const soraniWord = (l: SoraniLetter): string | null => sounds.soraniWord(l);

/*
 * One player for the whole page, shared with lessons since they play
 * recordings too (lib/sound.ts): a new sound stops the last one.
 */
export { onPlaying, play } from '../lib/sound';
