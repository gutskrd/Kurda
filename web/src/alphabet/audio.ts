import { useEffect, useSyncExternalStore } from 'react';
import { isSpeakerId, type AlphabetAudioResponse, type RecordingVoice } from '@kurda/shared';
import { spokenClips, type SpokenClip } from '../characters/clips';
import { API_URL } from '../lib/config';
import { CLIPS } from './clips';
import { LATIN, SORANI, type SoraniLetter } from './letters';

/**
 * Where each sound is. The clips are files on this site (see
 * scripts/alphabet-audio/generate.py), so playing one costs a few kilobytes
 * from the edge and no request to anybody's server.
 *
 * A key with no clip answers null, and the page shows no play button there:
 * a sound that could not be made accurately is left out rather than guessed.
 */
const BASE = '/audio/alphabet/';

/*
 * Recordings made in the admin panel, by key. A recording wins over the
 * synthesised clip for its key; until they arrive (or if the API is asleep or
 * unreachable) the synthesised clips play, so the page never waits on them.
 */
let recorded: Readonly<Record<string, string>> = {};
/** who says a recording, by its URL, with the words it says; only the recordings an editor gave a character */
let voices: ReadonlyMap<string, { voice: RecordingVoice; text: string | null }> = new Map();
let version = 0;
let loading: Promise<void> | null = null;
const changed = new Set<() => void>();

export function loadRecordings(): Promise<void> {
  loading ??= fetch(`${API_URL}/alphabet/audio`)
    .then((res) => (res.ok ? (res.json() as Promise<Partial<AlphabetAudioResponse>>) : { clips: {} }))
    .then(({ clips, voices: said }) => {
      // only https URLs to keys the page knows: anything else is not ours to play
      const ok = Object.entries(clips ?? {}).filter(
        (e): e is [string, string] => e[0] in CLIPS && typeof e[1] === 'string' && e[1].startsWith('https://'),
      );
      if (ok.length === 0) return;
      recorded = Object.fromEntries(ok);
      const heard = new Map<string, { voice: RecordingVoice; text: string | null }>();
      for (const [key, url] of ok) {
        const voice = said?.[key];
        if (voice && isSpeakerId(voice.speaker)) heard.set(url, { voice, text: wordsOf(key) });
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

/** What a sound's recording says, for moving a character's mouth when no timeline was saved with it. */
function wordsOf(key: string): string | null {
  const [script, kind, id = ''] = key.split(':');
  if (script === 'pair') return kind ?? null;
  if (script === 'kmr') return kind === 'word' ? (LATIN.find((l) => l.id === id)?.word ?? null) : id;
  const letter = SORANI.find((l) => l.id === id);
  return (kind === 'word' ? letter?.word : letter?.char) ?? null;
}

/**
 * The recordings among `srcs` that an editor gave a character, with who says
 * each: a synthesised clip never has one.
 */
export function spokenAlphabet(...srcs: Array<string | null>): SpokenClip[] {
  return spokenClips(srcs.map((src) => ({ src, ...(src ? voices.get(src) : undefined) })));
}

/** True for a synthesised clip, so the page can say so — and only then. */
export function isSynthesised(src: string | null): boolean {
  return !!src && src.startsWith(BASE);
}

function clip(key: string): string | null {
  const own = recorded[key];
  if (own) return own;
  const file = CLIPS[key];
  return file ? BASE + file : null;
}

export const latinSound = (id: string): string | null => clip(`kmr:sound:${id}`);
export const latinWord = (id: string): string | null => clip(`kmr:word:${id}`);
export const pairWord = (word: string): string | null => clip(`pair:${word}`);

/** A Soranî letter's sound: its own where only Soranî has one, else its Kurmancî partner's — the same sound. */
export function soraniSound(l: SoraniLetter): string | null {
  return clip(`ckb:sound:${l.id}`) ?? (l.latin ? latinSound(l.latin) : null);
}
export const soraniWord = (l: SoraniLetter): string | null => clip(`ckb:word:${l.id}`);

/*
 * One player for the whole page, shared with lessons since they play
 * recordings too (lib/sound.ts): a new sound stops the last one.
 */
export { onPlaying, play } from '../lib/sound';
