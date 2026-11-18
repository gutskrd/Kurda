/**
 * Who says a recording and its mouth's timeline: read from requests and written into what the apps are sent. Every
 * kind of recording has `speaker` (one of SPEAKERS, or NULL for none) and `lipsync` (the stored timeline, checked
 * strictly before storing). A recording with a speaker but no stored timeline is sent one made from its words and
 * length (`lipsyncFromText`), marked `lipsyncSource: 'text'`, since the apps often lack the words; it is never stored,
 * so a stored timeline always means one made from the sound.
 */
import { z } from 'zod';
import {
  SPEAKERS,
  encodeLipsync,
  isSpeakerId,
  lipsyncFromText,
  safeDecodeLipsync,
  type LipsyncData,
  type LipsyncScript,
  type LipsyncTimeline,
  type RecordingVoice,
  type SpeakerId,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

/** The most cues a timeline may have: several times what the longest recording needs. */
export const LIPSYNC_MAX_ENTRIES = 2000;

/** How much longer than its recording a timeline may be: the browser's decoder may count a frame or two of padding the server does not. */
export const LIPSYNC_TOLERANCE_MS = 250;

/** The columns a delivery query reads from table `alias`: the speaker, and the timeline only with a speaker, so no payload carries an unused one. */
export function voiceColumns(alias = ''): string {
  const at = alias ? `${alias}.` : '';
  return `${at}speaker, CASE WHEN ${at}speaker IS NOT NULL THEN ${at}lipsync END AS lipsync`;
}

export interface VoiceRow {
  speaker: string | null;
  lipsync: unknown;
}

/** What a recording says and how long it lasts, for a timeline made from its words. */
export interface SpokenWords {
  text: string;
  /** null where no length is stored (a dictionary pronunciation): then nothing is made */
  durationMs: number | null;
  script?: LipsyncScript;
}

/** How many word-made timelines are cached: a busy lesson's and story's worth many times over. */
const TEXT_TIMELINES_KEPT = 2000;

/** Word-made timelines, most recently used last; null where none can be made, so it is not attempted twice. */
const textTimelines = new Map<string, LipsyncData | null>();

/**
 * The timeline for `words` spread over their recording's length, or null when the length is unknown or nothing fits.
 * Deterministic, so each is made once and cached by words, length and script among the TEXT_TIMELINES_KEPT most recent.
 */
export function textLipsync(words: SpokenWords): LipsyncData | null {
  const { text, durationMs, script } = words;
  if (durationMs === null || !(durationMs > 0) || text === '') return null;
  const key = `${script ?? ''}\u0000${durationMs}\u0000${text}`;
  if (textTimelines.has(key)) {
    const kept = textTimelines.get(key)!;
    textTimelines.delete(key);
    textTimelines.set(key, kept);
    return kept;
  }
  let made: LipsyncData | null;
  try {
    made = encodeLipsync(lipsyncFromText(text, durationMs, script ? { script } : {}));
  } catch {
    // longer than any timeline may be: the apps rest the mouth instead
    made = null;
  }
  textTimelines.set(key, made);
  if (textTimelines.size > TEXT_TIMELINES_KEPT) textTimelines.delete(textTimelines.keys().next().value!);
  return made;
}

/**
 * What travels beside a recording's URL: nothing without a speaker, else the stored timeline, else one made from
 * `words` when they and the length are known.
 */
export function voiceOf(row: VoiceRow, words?: SpokenWords): RecordingVoice | undefined {
  if (!isSpeakerId(row.speaker)) return undefined;
  if (row.lipsync) return { speaker: row.speaker, lipsync: row.lipsync as LipsyncData };
  const made = words ? textLipsync(words) : null;
  return made ? { speaker: row.speaker, lipsync: made, lipsyncSource: 'text' } : { speaker: row.speaker };
}

/** A timeline in its stored form, checked strictly; read as the timeline it is. */
export const lipsyncSchema = z.unknown().transform((value, ctx): LipsyncTimeline => {
  const read = safeDecodeLipsync(value, { maxCues: LIPSYNC_MAX_ENTRIES });
  if (!read.ok) {
    ctx.addIssue({ code: 'custom', message: read.error });
    return z.NEVER;
  }
  return read.timeline;
});

export const speakerSchema = z.enum(SPEAKERS);

/** A timeline as stored once it fits its recording, within LIPSYNC_TOLERANCE_MS; decodeLipsync keeps every cue inside the timeline, so inside the recording. */
export function fitLipsync(timeline: LipsyncTimeline, durationMs: number): LipsyncData {
  if (timeline.durationMs > durationMs + LIPSYNC_TOLERANCE_MS) {
    throw new AppError(
      'LIPSYNC_TOO_LONG',
      400,
      `the timeline is ${timeline.durationMs} ms long and the recording ${durationMs} ms: make it from this recording`,
    );
  }
  return encodeLipsync(timeline);
}

/**
 * The speaker and timeline for a new recording, from its upload's query string (the body is the audio):
 *
 *   speaker=hevalo|hamo|xezo   who says it
 *   speaker=none                no character
 *   (no speaker)                whoever said the recording it replaces
 *   lipsync={"v":1,…}           its timeline, URL-encoded JSON
 *   (no lipsync)                none, since an old timeline belongs to the old take
 *
 * The caller checks the timeline against the recording's length once it has read the recording.
 */
export function voiceFromQuery(query: unknown): { speaker?: SpeakerId | null; lipsync?: LipsyncTimeline } {
  const q = (typeof query === 'object' && query !== null ? query : {}) as { speaker?: unknown; lipsync?: unknown };
  const out: { speaker?: SpeakerId | null; lipsync?: LipsyncTimeline } = {};
  if (q.speaker !== undefined) {
    if (q.speaker === '' || q.speaker === 'none') out.speaker = null;
    else if (isSpeakerId(q.speaker)) out.speaker = q.speaker;
    else throw new AppError('UNKNOWN_SPEAKER', 400, `the speaker is one of ${SPEAKERS.join(', ')}, or none`);
  }
  if (q.lipsync !== undefined) {
    let parsed: unknown;
    try {
      parsed = typeof q.lipsync === 'string' ? JSON.parse(q.lipsync) : undefined;
    } catch {
      parsed = undefined;
    }
    const read = safeDecodeLipsync(parsed, { maxCues: LIPSYNC_MAX_ENTRIES });
    if (!read.ok) throw new AppError('INVALID_LIPSYNC', 400, `the lip-sync timeline is not valid: ${read.error}`);
    out.lipsync = read.timeline;
  }
  return out;
}

/** How a timeline is named in the audit trail: its size, not its cues. */
export function lipsyncSummary(lipsync: unknown): { durationMs: number; cues: number } | null {
  if (typeof lipsync !== 'object' || lipsync === null) return null;
  const { d, k } = lipsync as { d?: unknown; k?: unknown };
  return { durationMs: typeof d === 'number' ? d : 0, cues: Array.isArray(k) ? k.length : 0 };
}
