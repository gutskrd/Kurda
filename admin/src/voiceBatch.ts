/**
 * Every recording at once, for the Characters page's jobs: which ones have
 * no character yet, which have one but no mouth timeline, and making a
 * timeline for one that was recorded before the studio made them.
 *
 * Lesson and alphabet recordings come in two lists read whole; the
 * dictionary's pronunciations, which an import can bring by the thousand, a
 * page at a time (GET /admin/dictionary/audio).
 *
 * Kept apart from the page so the filters, the download and what a failure
 * says are tested without a browser.
 */
import {
  ALPHABET_CLIPS,
  type DictionaryAudioAdminItem,
  type DictionaryAudioAdminPage,
  type LipsyncData,
  type LipsyncScript,
  type SpeakerId,
} from '@kurda/shared';
import { api, apiFile, ApiError } from './api';
import type { Item } from './lessonAudio';
import { errorLine } from './ui/errors';
import { scriptOfClip, timelineFromSound, type AudioKind, type Speaker } from './voice';

export const KIND_NAMES: Record<AudioKind, string> = {
  lesson: 'Lesson and story sentences',
  alphabet: 'Alphabet sounds',
  dictionary: 'Dictionary pronunciations',
};

export interface VoiceRecording {
  kind: AudioKind;
  /** what PATCH /admin/audio/:kind names it by: a sentence's or a sound's key, a pronunciation's id */
  key: string;
  /** the words said, as the timeline reads them */
  text: string;
  script?: LipsyncScript;
  url: string;
  durationMs: number | null;
  speaker: Speaker;
  hasLipsync: boolean;
}

/** An alphabet recording as GET /admin/alphabet/audio lists it. */
export interface AlphabetRecording {
  key: string;
  url: string;
  durationMs: number | null;
  updatedAt: string;
  speaker?: SpeakerId | null;
  hasLipsync?: boolean;
  lipsync?: LipsyncData | null;
}

export function fromLessons(items: readonly Item[]): VoiceRecording[] {
  return items.flatMap((i) =>
    i.recorded && i.url
      ? [{ kind: 'lesson' as const, key: i.key, text: i.text, url: i.url, durationMs: i.durationMs, speaker: i.speaker ?? null, hasLipsync: i.hasLipsync ?? false }]
      : [],
  );
}

/** A sound's recording is of its `say`: the letter with its vowel, or the example word. */
export function fromAlphabet(recordings: readonly AlphabetRecording[]): VoiceRecording[] {
  return recordings.flatMap((r) => {
    const clip = ALPHABET_CLIPS.find((c) => c.key === r.key);
    if (!clip) return [];
    return [
      {
        kind: 'alphabet' as const,
        key: r.key,
        text: clip.say,
        script: scriptOfClip(clip.script),
        url: r.url,
        durationMs: r.durationMs,
        speaker: r.speaker ?? null,
        hasLipsync: r.hasLipsync ?? false,
      },
    ];
  });
}

/** A pronunciation says its headword. */
export function fromDictionary(item: DictionaryAudioAdminItem): VoiceRecording {
  return { kind: 'dictionary', key: item.id, text: item.headword, url: item.url, durationMs: null, speaker: item.speaker, hasLipsync: item.hasLipsync };
}

export interface DictionaryFilter {
  speaker?: 'none' | 'any' | SpeakerId;
  lipsync?: 'missing' | 'present';
  /** the start of the headword */
  q?: string;
}

/** The most pronunciations one page may hold. */
export const DICTIONARY_PAGE_MAX = 200;

/** One page of the dictionary's pronunciations, in headword order; `cursor` is the last page's `nextCursor`. */
export function dictionaryPage(
  filter: DictionaryFilter,
  cursor: string | null,
  { limit = DICTIONARY_PAGE_MAX, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<DictionaryAudioAdminPage> {
  const params = new URLSearchParams();
  if (filter.speaker) params.set('speaker', filter.speaker);
  if (filter.lipsync) params.set('lipsync', filter.lipsync);
  if (filter.q?.trim()) params.set('q', filter.q.trim());
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return api<DictionaryAudioAdminPage>(`/admin/dictionary/audio?${params}`, { signal });
}

export type KindFilter = 'all' | AudioKind;

export const ofKind = (kind: AudioKind, kinds: KindFilter): boolean => kinds === 'all' || kind === kinds;

/** What "Give them a character" changes: the recordings no one is shown saying. */
export function needsSpeaker(r: VoiceRecording, kinds: KindFilter): boolean {
  return ofKind(r.kind, kinds) && r.speaker === null;
}

/**
 * What "Make timelines" works on: the recordings with a character and no
 * timeline — or, with `remake`, every recording with a character, its old
 * timeline replaced. One with no character shows no mouth, so it is left out.
 */
export function needsTimeline(r: VoiceRecording, kinds: KindFilter, remake: boolean): boolean {
  return ofKind(r.kind, kinds) && r.speaker !== null && (remake || !r.hasLipsync);
}

export interface KindCounts {
  kind: AudioKind;
  recorded: number;
  noSpeaker: number;
  /** a character and no timeline */
  noTimeline: number;
}

/** The counts of the lists read whole, and the dictionary's as its list gives them. */
export function countByKind(recordings: readonly VoiceRecording[], dictionary: DictionaryAudioAdminPage['counts']): KindCounts[] {
  const listed = (['lesson', 'alphabet'] as const).map((kind) => {
    const mine = recordings.filter((r) => r.kind === kind);
    return {
      kind,
      recorded: mine.length,
      noSpeaker: mine.filter((r) => r.speaker === null).length,
      noTimeline: mine.filter((r) => r.speaker !== null && !r.hasLipsync).length,
    };
  });
  return [...listed, { kind: 'dictionary', recorded: dictionary.total, noSpeaker: dictionary.noSpeaker, noTimeline: dictionary.speakerNoTimeline }];
}

/** The file was read, and the browser could not make sound of it. */
export class TimelineError extends Error {}

/**
 * A stored recording's timeline: its file read through the API (GET
 * /admin/audio/:kind/file), decoded here and matched to its words. Through
 * the API, so a file on the media bucket or on another site is read without
 * either allowing this origin. A refusal is the API's (an ApiError, which
 * `failureLine` puts into words); `signal` stops the download.
 */
export async function timelineFromFile(r: VoiceRecording, signal?: AbortSignal): Promise<LipsyncData> {
  const data = await apiFile(`/admin/audio/${r.kind}/file?key=${encodeURIComponent(r.key)}`, { signal });
  try {
    return await timelineFromSound(data, r.text, r.script);
  } catch {
    throw new TimelineError('The browser could not read the sound in this file.');
  }
}

/**
 * Why the API could not send a file, by the reason it gives
 * (recording-file.ts), where its own message is about the file rather than a
 * site.
 */
const UNREACHABLE: Record<string, string> = {
  storage: 'The file could not be read from media storage.',
  too_large: 'The file is too large to be a recording.',
  not_audio: 'The file at its address is not a recording.',
  empty: 'The file at its address is empty.',
};
/** Reasons whose message names the site and what it did ("upload.wikimedia.org answered 404"): said as it is. */
const FROM_ITS_SITE = new Set(['dns', 'network', 'timeout', 'status', 'redirects']);

/** What went wrong with one recording, for the list of failures. */
export function failureLine(err: unknown): string {
  if (err instanceof TimelineError) return err.message;
  if (err instanceof ApiError) {
    const reason = String((err.details as { reason?: unknown } | undefined)?.reason ?? '');
    const detail = err.message.trim().replace(/[.!?]$/, '');
    if (err.code === 'AUDIO_UNREACHABLE') {
      const own = FROM_ITS_SITE.has(reason) ? undefined : UNREACHABLE[reason];
      return own ?? (detail ? `Could not get the file: ${detail}.` : 'Could not get the file.');
    }
    // a site recordings are not fetched from, or an address that leads inside a private network
    if (err.code === 'AUDIO_HOST_NOT_ALLOWED') return detail ? `The server will not fetch it: ${detail}.` : 'The server will not fetch it.';
    if (err.code === 'MEDIA_UNAVAILABLE') return 'The server has no media storage set up, so the file cannot be read.';
    if (err.status === 404) return 'It is gone: the recording, or its file, was removed after the list was loaded.';
  }
  return errorLine(err);
}

/** How long to wait when the server asks the job to slow down (429), in ms; null for any other failure. */
export function retryAfterMs(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  return (err.retryAfterSec ?? 30) * 1000;
}
