/**
 * Who says a recording, and its mouth's timeline: reading them from a request
 * and writing them into what the apps are sent.
 *
 * Every kind of recording carries the same two columns (1751000183000):
 * `speaker`, one of SPEAKERS or NULL for no character, and `lipsync`, the
 * stored timeline. A timeline is checked strictly before it is stored, so the
 * apps decode what they are sent without guarding against anything else.
 */
import { z } from 'zod';
import {
  SPEAKERS,
  encodeLipsync,
  isSpeakerId,
  safeDecodeLipsync,
  type LipsyncData,
  type LipsyncTimeline,
  type RecordingVoice,
  type SpeakerId,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

/** The most cues a timeline may have: several times what the longest recording needs. */
export const LIPSYNC_MAX_ENTRIES = 2000;

/**
 * How much longer than its recording a timeline may say it is. The browser
 * that made it decoded the file itself, and a decoder may count a frame or two
 * of padding that the server's reading of the file does not.
 */
export const LIPSYNC_TOLERANCE_MS = 250;

/**
 * The columns a delivery query reads, from the table aliased `alias` (or
 * none): the speaker, and the timeline only when there is a speaker to show,
 * so a recording without one never costs a payload its timeline.
 */
export function voiceColumns(alias = ''): string {
  const at = alias ? `${alias}.` : '';
  return `${at}speaker, CASE WHEN ${at}speaker IS NOT NULL THEN ${at}lipsync END AS lipsync`;
}

export interface VoiceRow {
  speaker: string | null;
  lipsync: unknown;
}

/** What travels beside a recording's URL: nothing without a speaker; the timeline when there is one. */
export function voiceOf(row: VoiceRow): RecordingVoice | undefined {
  if (!isSpeakerId(row.speaker)) return undefined;
  return row.lipsync ? { speaker: row.speaker, lipsync: row.lipsync as LipsyncData } : { speaker: row.speaker };
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

/**
 * A timeline as it is stored, once it is known to fit its recording: no
 * longer than the recording, give or take LIPSYNC_TOLERANCE_MS. Every cue is
 * inside the timeline (decodeLipsync saw to that), so every cue is inside the
 * recording too.
 */
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
 * The speaker and timeline that come with a new recording, in its upload's
 * query string beside the text or key (the body is the audio itself):
 *
 *   speaker=hevalo|hamo|xezo   who says it
 *   speaker=none                no character
 *   (no speaker)                whoever said the recording it replaces
 *   lipsync={"v":1,…}           its timeline, URL-encoded JSON
 *   (no lipsync)                none: an old timeline belongs to the old take
 *
 * The timeline is checked against the recording's length by the caller, once
 * the recording has been read.
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
