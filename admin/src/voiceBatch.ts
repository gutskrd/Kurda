/**
 * Every recording at once, for the Characters page's jobs: which ones have
 * no character yet, which have one but no mouth timeline, and making a
 * timeline for one that was recorded before the studio made them.
 *
 * Kept apart from the page so the filters and the download are tested
 * without a browser.
 */
import { ALPHABET_CLIPS, type LipsyncData, type LipsyncScript, type SpeakerId } from '@kurda/shared';
import type { Item } from './lessonAudio';
import { scriptOfClip, timelineFromSound, type AudioKind, type Speaker } from './voice';

/** The kinds this page lists. Dictionary pronunciations have no list to read them from. */
export type ListedKind = Extract<AudioKind, 'lesson' | 'alphabet'>;

export const KIND_NAMES: Record<ListedKind, string> = {
  lesson: 'Lesson and story sentences',
  alphabet: 'Alphabet sounds',
};

export interface VoiceRecording {
  kind: ListedKind;
  /** what PATCH /admin/audio/:kind names it by */
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

export type KindFilter = 'all' | ListedKind;

const ofKind = (r: VoiceRecording, kinds: KindFilter): boolean => kinds === 'all' || r.kind === kinds;

/** What "Give them a character" changes: the recordings no one is shown saying. */
export function needsSpeaker(r: VoiceRecording, kinds: KindFilter): boolean {
  return ofKind(r, kinds) && r.speaker === null;
}

/**
 * What "Make timelines" works on: the recordings with a character and no
 * timeline — or, with `remake`, every recording with a character, its old
 * timeline replaced. One with no character shows no mouth, so it is left out.
 */
export function needsTimeline(r: VoiceRecording, kinds: KindFilter, remake: boolean): boolean {
  return ofKind(r, kinds) && r.speaker !== null && (remake || !r.hasLipsync);
}

export interface KindCounts {
  kind: ListedKind;
  recorded: number;
  noSpeaker: number;
  /** a character and no timeline */
  noTimeline: number;
}

export function countByKind(recordings: readonly VoiceRecording[]): KindCounts[] {
  return (Object.keys(KIND_NAMES) as ListedKind[]).map((kind) => {
    const mine = recordings.filter((r) => r.kind === kind);
    return {
      kind,
      recorded: mine.length,
      noSpeaker: mine.filter((r) => r.speaker === null).length,
      noTimeline: mine.filter((r) => r.speaker !== null && !r.hasLipsync).length,
    };
  });
}

/** Why a timeline could not be made from a stored recording, in words for the list of failures. */
export class TimelineError extends Error {
  constructor(
    readonly reason: 'blocked' | 'http' | 'decode',
    message: string,
  ) {
    super(message);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url, location.href).host;
  } catch {
    return 'its host';
  }
}

/**
 * A stored recording's timeline: its file downloaded, decoded here and
 * matched to its words. Without credentials: the media host is public, and
 * the panel's sign-in is not for it.
 *
 * A file on another site can be read only if that site allows this one to
 * (CORS) and the panel's own policy lets it connect there (connect-src in
 * public/_headers); either refusal looks the same from here, a fetch that
 * fails without an answer, so the message names both.
 */
export async function timelineFromUrl(r: VoiceRecording, signal?: AbortSignal): Promise<LipsyncData> {
  let res: Response;
  try {
    res = await fetch(r.url, { signal, credentials: 'omit' });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new TimelineError(
      'blocked',
      `The browser was not allowed to read the file from ${hostOf(r.url)}. That site has to allow this one to read its files (CORS), or the connection dropped.`,
    );
  }
  if (!res.ok) throw new TimelineError('http', `The file could not be downloaded (HTTP ${res.status}).`);
  const data = await res.arrayBuffer();
  try {
    return await timelineFromSound(data, r.text, r.script);
  } catch {
    throw new TimelineError('decode', 'The browser could not read the sound in this file.');
  }
}
