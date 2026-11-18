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
 * Where each alphabet and word-set sound plays from. Synthesised clips are static files on this site
 * (scripts/alphabet-audio); which file or recording a key plays is decided in @kurda/shared, as on the phone. The word
 * sets' recordings come in the same `GET /alphabet/audio` answer under the words' keys. A key with no clip is null,
 * and the page shows no play button for it.
 */

/*
 * Recordings made in the admin panel, by key, win over the synthesised clips. Until they arrive, or if the API is
 * unreachable, the synthesised clips play, so the page never waits on them.
 */
let sounds: AlphabetSounds = alphabetSounds();
let words: WordSetSounds = wordSetSounds();
/** The character and words of each recording an editor gave a character, by URL. */
let voices: ReadonlyMap<string, { voice: RecordingVoice; text: string | null }> = new Map();
let version = 0;
let loading: Promise<void> | null = null;
const changed = new Set<() => void>();

export function loadRecordings(): Promise<void> {
  loading ??= fetch(`${API_URL}/alphabet/audio`)
    .then((res) => (res.ok ? (res.json() as Promise<Partial<AlphabetAudioResponse>>) : { clips: {} }))
    .then(({ clips, voices: said }) => {
      // Only https URLs for keys the pages know are kept.
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

/** Where every sound plays from now, for a practice round that uses whatever has arrived. */
export function currentSounds(): AlphabetSounds {
  return sounds;
}

/** The word sets' sounds as they stand now. */
export function currentWordSounds(): WordSetSounds {
  return words;
}

/** Where a word-set word plays from in a dialect: its recording, else its synthesised clip, else null. */
export const wordSound = (word: SetWord, dialect: WordDialect): string | null => words.of(word, dialect);

/** The recordings among `srcs` that an editor gave a character, with who says each. */
export function spokenAlphabet(...srcs: Array<string | null>): SpokenClip[] {
  return spokenClips(srcs.map((src) => ({ src, ...(src ? voices.get(src) : undefined) })));
}

/** True for a synthesised clip, a letter's or a word's, so the page can label it. */
export const isSynthesised = (src: string | null): boolean => sounds.isSynthesised(src) || words.isSynthesised(src);

export const latinSound = (id: string): string | null => sounds.latinSound(id);
export const latinWord = (id: string): string | null => sounds.latinWord(id);
export const pairWord = (word: string): string | null => sounds.pairWord(word);
/** A Soranî letter's sound: its own where only Soranî has the letter, else its Kurmancî partner's. */
export const soraniSound = (l: SoraniLetter): string | null => sounds.soraniSound(l);
export const soraniWord = (l: SoraniLetter): string | null => sounds.soraniWord(l);

/* One player shared with lessons (lib/sound.ts), so a new sound stops the last one. */
export { onPlaying, play } from '../lib/sound';
