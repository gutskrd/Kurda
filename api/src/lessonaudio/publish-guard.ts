import type pg from 'pg';
import { lessonAudioKey } from '@kurda/shared';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * Listening items and the recordings they play.
 *
 * A listening item's own clip (`audioUrl`) is optional: without one it plays
 * the audio studio's recording of its first accepted transcription. Nothing in
 * the payload then guarantees it has anything to play, so publishing checks
 * (`silentListening`), and removing a recording a published item plays needs
 * saying so (`lessonsPlaying`). A silent item reaches a learner as a play
 * button that does nothing and an exercise they can only skip.
 */

/** A listening item that would have nothing to play. */
export interface SilentListening {
  /** its index in the exercises given */
  index: number;
  /** the transcription it waits for a recording of, as the payload writes it */
  text: string;
}

interface ListeningPayload {
  audioUrl?: unknown;
  accepted?: unknown;
}

/**
 * The transcription whose studio recording a listening payload plays: null
 * when it has a clip of its own, '' when it is too malformed to say.
 */
export function playsRecordingOf(payload: unknown): string | null {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as ListeningPayload;
  if (typeof p.audioUrl === 'string' && p.audioUrl !== '') return null;
  const first = Array.isArray(p.accepted) ? p.accepted[0] : undefined;
  return typeof first === 'string' ? first : '';
}

/**
 * The listening items among `exercises` with no clip of their own and no
 * studio recording of their transcription, in one query.
 *
 * `lock` share-locks the recordings found, for a caller in a transaction: the
 * DELETE route locks a recording's row before it checks who plays it, so one
 * cannot be removed between this check and the caller's commit.
 */
export async function silentListening(
  db: Executor,
  exercises: ReadonlyArray<{ type: string; payload: unknown }>,
  opts: { lock?: boolean } = {},
): Promise<SilentListening[]> {
  const waiting: Array<SilentListening & { key: string }> = [];
  exercises.forEach((ex, index) => {
    if (ex.type !== 'listening') return;
    const text = playsRecordingOf(ex.payload);
    if (text !== null) waiting.push({ index, text, key: lessonAudioKey(text) });
  });
  if (waiting.length === 0) return [];

  const keys = [...new Set(waiting.map((w) => w.key).filter((k) => k !== ''))];
  const recorded = new Set<string>();
  if (keys.length > 0) {
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM lesson_audio WHERE key = ANY($1::text[])${opts.lock ? ' FOR SHARE' : ''}`,
      [keys],
    );
    for (const r of rows) recorded.add(r.key);
  }
  return waiting.filter((w) => !recorded.has(w.key)).map(({ index, text }) => ({ index, text }));
}

/** What an editor is told when publishing would put a silent listening item in front of learners. */
export function silentListeningMessage(silent: readonly SilentListening[]): string {
  const texts = [...new Set(silent.map((s) => s.text))];
  const named = texts
    .slice(0, 3)
    .map((t) => `“${t}”`)
    .join(', ');
  const more = texts.length > 3 ? ` and ${texts.length - 3} more` : '';
  const items = silent.length === 1 ? 'A listening item has' : `${silent.length} listening items have`;
  return `${items} nothing to play. Record ${named}${more} in the audio studio, or give the item a clip of its own.`;
}

/**
 * The published lessons with a listening item that has no clip of its own and
 * plays the recording filed under `key` — what removing that recording would
 * leave silent. Older published versions count: sessions stay pinned to them.
 */
export async function lessonsPlaying(db: Executor, key: string): Promise<Array<{ lessonId: string; title: string }>> {
  const { rows } = await db.query<{ lesson_id: string; title_en: string; payload: unknown }>(
    `SELECT l.id lesson_id, l.title_en, e.payload
     FROM exercises e JOIN lessons l ON l.id = e.lesson_id
     WHERE l.status = 'published' AND e.type = 'listening' AND coalesce(e.payload->>'audioUrl', '') = ''
     ORDER BY l.title_en, l.version`,
  );
  const found = new Map<string, string>();
  for (const r of rows) {
    const text = playsRecordingOf(r.payload);
    if (text !== null && lessonAudioKey(text) === key && !found.has(r.lesson_id)) found.set(r.lesson_id, r.title_en);
  }
  return [...found].map(([lessonId, title]) => ({ lessonId, title }));
}
