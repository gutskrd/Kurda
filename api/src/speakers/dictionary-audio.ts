/**
 * The dictionary's pronunciations, for the admin panel's Characters page:
 *
 *   GET /admin/dictionary/audio?speaker=…&lipsync=…&q=…&cursor=…&limit=…
 *
 *   speaker   none | any | hevalo | hamo | xezo   who says it (none: no character)
 *   lipsync   missing | present                   whether a timeline is stored
 *   q         the start of the headword, as typed or without its accents
 *   limit     1–200, 100 when not given
 *   cursor    the page's `nextCursor`, for the page after it
 *
 * In headword order, then by id, a page at a time: an import can bring a
 * pronunciation with every word, so this is never sent whole. Each item
 * carries its stored timeline, so a page is at most a couple of hundred small
 * timelines. `counts` is over every pronunciation, whatever the filters, for
 * the page's summary.
 *
 * Each item's `id` is what PATCH /admin/audio/dictionary and
 * GET /admin/audio/dictionary/file take as `key`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  SPEAKERS,
  dictionaryKey,
  type DictionaryAudioAdminPage,
  type LipsyncData,
  type SpeakerId,
} from '@kurda/shared';
import { escapeLike } from '../db/like.js';
import { AppError } from '../plugins/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listQuery = z.object({
  speaker: z.enum(['none', 'any', ...SPEAKERS]).optional(),
  lipsync: z.enum(['missing', 'present']).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

interface Cursor {
  headword: string;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.headword, c.id]), 'utf8').toString('base64url');
}

/** A cursor this list gave out, or null when it is not one. */
function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [headword, id] = parsed as [unknown, unknown];
    if (typeof headword !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
    return { headword, id };
  } catch {
    return null;
  }
}

interface Row {
  id: string;
  entry_id: string;
  headword: string;
  dialect: string;
  audio_url: string;
  speaker: SpeakerId | null;
  lipsync: LipsyncData | null;
}

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function registerDictionaryAudioList(app: FastifyInstance, canRecord: Guard): void {
  app.get('/admin/dictionary/audio', { schema: { querystring: listQuery }, preHandler: canRecord }, async (req) => {
    const { speaker, lipsync, q, cursor, limit } = req.query as z.infer<typeof listQuery>;
    const params: unknown[] = [];
    const conds: string[] = [];
    const add = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (speaker === 'none') conds.push('a.speaker IS NULL');
    else if (speaker === 'any') conds.push('a.speaker IS NOT NULL');
    else if (speaker) conds.push(`a.speaker = ${add(speaker)}`);
    if (lipsync === 'missing') conds.push('a.lipsync IS NULL');
    else if (lipsync === 'present') conds.push('a.lipsync IS NOT NULL');
    if (q) {
      // as typed, or by the folded key, so "sev" finds sêv as the dictionary's own search does
      const typed = `e.headword ILIKE ${add(`${escapeLike(q)}%`)}`;
      const folded = dictionaryKey(q);
      conds.push(folded ? `(${typed} OR e.headword_folded LIKE ${add(`${escapeLike(folded)}%`)})` : typed);
    }
    if (cursor) {
      const after = decodeCursor(cursor);
      if (!after) throw new AppError('BAD_CURSOR', 400, 'that cursor is not one this list gave out');
      conds.push(`(e.headword, a.id) > (${add(after.headword)}, ${add(after.id)}::uuid)`);
    }

    const [page, counted] = await Promise.all([
      app.db.query<Row>(
        `SELECT a.id, a.entry_id, e.headword, a.dialect, a.audio_url, a.speaker, a.lipsync
           FROM dict_audio a JOIN dict_entries e ON e.id = a.entry_id
          ${conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''}
          ORDER BY e.headword, a.id
          LIMIT ${add(limit + 1)}`,
        params,
      ),
      app.db.query<{ total: number; no_speaker: number; speaker_no_timeline: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE speaker IS NULL)::int AS no_speaker,
                COUNT(*) FILTER (WHERE speaker IS NOT NULL AND lipsync IS NULL)::int AS speaker_no_timeline
           FROM dict_audio`,
      ),
    ]);

    const rows = page.rows.slice(0, limit);
    const last = rows[rows.length - 1];
    const counts = counted.rows[0]!;
    const body: DictionaryAudioAdminPage = {
      items: rows.map((r) => ({
        id: r.id,
        entryId: r.entry_id,
        headword: r.headword,
        dialect: r.dialect,
        url: r.audio_url,
        speaker: r.speaker,
        hasLipsync: r.lipsync !== null,
        lipsync: r.lipsync,
      })),
      nextCursor: page.rows.length > limit && last ? encodeCursor({ headword: last.headword, id: last.id }) : null,
      counts: { total: counts.total, noSpeaker: counts.no_speaker, speakerNoTimeline: counts.speaker_no_timeline },
    };
    return body;
  });
}
