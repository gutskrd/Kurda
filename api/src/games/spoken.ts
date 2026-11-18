/**
 * The recordings of a round's lines, read once for the whole round.
 *
 * Detective plays the remarks on its board in a person's recorded voice. A conversation line is filed under
 * conversation, part and words (`conversationLineKey`), a standalone sentence under its words (`lessonAudioKey`); each
 * line lists its possible keys, most specific first, and takes the first with a recording. One query for all lines.
 *
 * The recording's address travels beside the line's words, as lesson conversations send theirs
 * (lessonaudio/delivery.ts), revealing nothing the screen does not show. The speaker shown is always the character
 * playing the line's part, whatever voice it was saved under, with the recording's mouth timeline or one made from its
 * words.
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
