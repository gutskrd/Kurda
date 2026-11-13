/**
 * The recordings of the lines a round shows, read once for the whole round.
 *
 * Detective plays the remarks pinned to its board in the voice a
 * person recorded them in. A line taken from a conversation is filed under
 * the conversation, its part and its words (`conversationLineKey`), and a
 * sentence recorded on its own under its words alone (`lessonAudioKey`); each
 * line names the keys it may be found under, most particular first, and gets
 * the first that has a recording. One query, however many lines.
 *
 * The recording's address travels beside the line's own words, as a lesson's
 * conversation sends its lines (lessonaudio/delivery.ts): nothing is behind
 * it that the screen does not already show. Who is seen saying it is always
 * the character playing the line's part, whichever voice it was saved under,
 * with the recording's own mouth timeline, or one made from its words.
 */
import type pg from 'pg';
import { lessonAudioKey, type SpeakerId, type SpokenAudio } from '@kurda/shared';
import { voiceColumns, voiceOf, type VoiceRow } from '../speakers/voice.js';

/** A line whose recording is wanted: the keys it may be filed under, and the character who says it in the round. */
export interface SpokenWant {
  keys: ReadonlyArray<string | null | undefined>;
  text: string;
  speaker: SpeakerId | null;
}

/** The keys a line may be filed under: its own (from a conversation), then its words alone. */
export function spokenKeys(recording: string | null | undefined, text: string): string[] {
  return [recording, lessonAudioKey(text)].filter((k): k is string => typeof k === 'string' && k !== '');
}

export async function spokenAudio(db: Pick<pg.Pool, 'query'>, wants: readonly SpokenWant[]): Promise<Array<SpokenAudio | null>> {
  const keys = [...new Set(wants.flatMap((w) => w.keys.filter((k): k is string => typeof k === 'string' && k !== '')))];
  if (keys.length === 0) return wants.map(() => null);
  const res = await db.query<{ key: string; url: string; text: string; duration_ms: number | null } & VoiceRow>(
    `SELECT key, url, text, duration_ms, ${voiceColumns()} FROM lesson_audio WHERE key = ANY($1::text[])`,
    [keys],
  );
  const byKey = new Map(res.rows.map((r) => [r.key, r]));
  return wants.map((w) => {
    const row = w.keys.map((k) => (k ? byKey.get(k) : undefined)).find((r) => r !== undefined);
    if (!row) return null;
    const voice = voiceOf(row, { text: row.text, durationMs: row.duration_ms });
    return { src: row.url, voice: w.speaker ? { ...voice, speaker: w.speaker } : (voice ?? null) };
  });
}
