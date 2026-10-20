/**
 * Who says a recording already made, and its mouth's timeline.
 *
 *   PATCH /admin/audio/:kind?key=…   { speaker?: SpeakerId | null, lipsync?: { v, d, k } | null }
 *
 * `kind` is the kind of recording, and `key` the one recording:
 *
 *   lesson      a lesson or story sentence, by its lessonAudioKey (as DELETE /admin/lesson-audio names it)
 *   alphabet    a sound on the alphabet page, by its ALPHABET_CLIPS key
 *   dictionary  a dictionary pronunciation, by its id (each entry's `audio[].id`)
 *
 * This is for recordings made before the characters, and for any whose
 * speaker or timeline should change without recording it again: choose a
 * character for it, make its timeline later from its sound, or take either
 * away (null). A field left out is left as it is; at least one is needed. The
 * key travels in the query string, as the studio's other routes carry it,
 * because a sentence is too long and too full of characters for a path.
 *
 * The timeline is checked strictly (decodeLipsync, at most
 * LIPSYNC_MAX_ENTRIES cues) and must be no longer than the recording. A
 * dictionary pronunciation has no stored length, so its timeline is held to
 * DICTIONARY_AUDIO_MAX_MS instead.
 *
 * The same people who record may do it. Under /admin, so the second factor
 * and the audit trail come with it; this also writes its own audit entry with
 * what changed.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ALPHABET_CLIP_MAX_SECONDS, LESSON_AUDIO_TEXT_MAX, isAlphabetClipKey, type SpeakerId } from '@kurda/shared';
import { AuditService } from '../admin/audit-service.js';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { LESSON_AUDIO_ROLES } from '../lessonaudio/routes.js';
import { fitLipsync, lipsyncSchema, lipsyncSummary, speakerSchema } from './voice.js';

/** The longest a dictionary pronunciation can be: a word, said slowly, many times over. */
export const DICTIONARY_AUDIO_MAX_MS = 30_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Kind {
  table: 'lesson_audio' | 'alphabet_audio' | 'dict_audio';
  column: 'key' | 'id';
  /** the stored length, or NULL where there is none */
  duration: string;
  /** a recording with no stored length is held to this */
  ceilingMs: number;
  /** whether `key` could name one at all, so a malformed one is a miss rather than a cast error */
  valid: (key: string) => boolean;
  /** what a miss says */
  missing: string;
}

const KINDS: Record<'lesson' | 'alphabet' | 'dictionary', Kind> = {
  lesson: {
    table: 'lesson_audio',
    column: 'key',
    duration: 'duration_ms',
    ceilingMs: Number.POSITIVE_INFINITY,
    valid: (key) => key !== '',
    missing: 'that text has no recording',
  },
  alphabet: {
    table: 'alphabet_audio',
    column: 'key',
    duration: 'duration_ms',
    // the longest the alphabet's upload accepts
    ceilingMs: ALPHABET_CLIP_MAX_SECONDS * 1000 + 250,
    valid: isAlphabetClipKey,
    missing: 'that sound has no recording',
  },
  dictionary: {
    table: 'dict_audio',
    column: 'id',
    duration: 'NULL::integer',
    ceilingMs: DICTIONARY_AUDIO_MAX_MS,
    valid: (key) => UUID.test(key),
    missing: 'no dictionary recording has that id',
  },
};

const params = z.object({ kind: z.enum(['lesson', 'alphabet', 'dictionary']) });
const query = z.object({ key: z.string().min(1).max(LESSON_AUDIO_TEXT_MAX * 2) });
const body = z
  .object({
    speaker: speakerSchema.nullable().optional(),
    lipsync: z.union([z.null(), lipsyncSchema]).optional(),
  })
  .refine((b) => b.speaker !== undefined || b.lipsync !== undefined, {
    message: 'say what to change: the speaker, the lipsync, or both',
  });

interface Row {
  duration_ms: number | null;
  speaker: SpeakerId | null;
  lipsync: unknown;
}

export function registerRecordingVoiceRoutes(app: FastifyInstance): void {
  const audit = new AuditService(app.db);
  const canRecord = requireRoles(...LESSON_AUDIO_ROLES);

  app.patch(
    '/admin/audio/:kind',
    { schema: { params, querystring: query, body }, preHandler: canRecord },
    async (req) => {
      const { kind } = req.params as z.infer<typeof params>;
      const { key } = req.query as z.infer<typeof query>;
      const change = req.body as z.infer<typeof body>;
      const spec = KINDS[kind];
      if (!spec.valid(key)) throw new AppError('NOT_FOUND', 404, spec.missing);

      const client = await app.db.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query<Row>(
          `SELECT ${spec.duration} AS duration_ms, speaker, lipsync FROM ${spec.table} WHERE ${spec.column} = $1 FOR UPDATE`,
          [key],
        );
        const before = found.rows[0];
        if (!before) throw new AppError('NOT_FOUND', 404, spec.missing);

        const speaker = change.speaker === undefined ? before.speaker : change.speaker;
        const lipsync =
          change.lipsync === undefined
            ? before.lipsync
            : change.lipsync === null
              ? null
              : fitLipsync(change.lipsync, before.duration_ms ?? spec.ceilingMs);
        await client.query(`UPDATE ${spec.table} SET speaker = $2, lipsync = $3::jsonb WHERE ${spec.column} = $1`, [
          key,
          speaker,
          lipsync === null ? null : JSON.stringify(lipsync),
        ]);
        await audit.record(client, {
          adminId: req.user!.id,
          action: 'audio.voice.set',
          targetType: spec.table,
          targetId: key,
          before: { speaker: before.speaker, lipsync: lipsyncSummary(before.lipsync) },
          after: { speaker, lipsync: lipsyncSummary(lipsync) },
          requestId: req.id,
        });
        await client.query('COMMIT');
        return { kind, key, speaker, lipsync };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
