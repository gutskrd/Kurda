/**
 * Who says an existing recording, and its mouth's timeline:
 *
 *   PATCH /admin/audio/:kind?key=…        { speaker?: SpeakerId | null, lipsync?: { v, d, k } | null }
 *   GET   /admin/audio/:kind/file?key=…   the recording's sound, to make its timeline from
 *   GET   /admin/dictionary/audio         the dictionary's pronunciations (dictionary-audio.ts)
 *
 *   lesson      a lesson or story sentence, by its lessonAudioKey (as DELETE /admin/lesson-audio names it)
 *   alphabet    an alphabet sound or word-set word, by its ALPHABET_CLIPS key
 *   dictionary  a dictionary pronunciation, by its id (each entry's `audio[].id`)
 *
 * For recordings made before the characters, or whose speaker or timeline should change without re-recording: set
 * either, or clear it with null; omitted fields stay, and at least one is needed. The key is in the query string, as a
 * sentence is too long for a path. Timelines are checked strictly (decodeLipsync, at most LIPSYNC_MAX_ENTRIES cues) and
 * may not exceed the recording; dictionary pronunciations have no stored length, so DICTIONARY_AUDIO_MAX_MS applies.
 * Open to recorders, under /admin with the second factor and audit trail, and the PATCH writes its own audit entry.
 * The file route is a read and writes none. The Characters page processes every recording two at a time, so both
 * routes allow 1,500 per ten minutes (BATCH_RATE).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { ALPHABET_CLIP_MAX_SECONDS, LESSON_AUDIO_TEXT_MAX, isAlphabetClipKey, type SpeakerId } from '@kurda/shared';
import { AuditService } from '../admin/audit-service.js';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { LESSON_AUDIO_ROLES } from '../lessonaudio/routes.js';
import { fitLipsync, lipsyncSchema, lipsyncSummary, speakerSchema } from './voice.js';
import { RecordingFiles, sendAudio, type RecordingFileOptions } from './recording-file.js';
import { registerDictionaryAudioList } from './dictionary-audio.js';

/** The longest a dictionary pronunciation can be: a word, said slowly, many times over. */
export const DICTIONARY_AUDIO_MAX_MS = 30_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A batch over every recording: well over a thousand in ten minutes, each a read and a save. */
const BATCH_RATE = { max: 1500, windowMs: 10 * 60_000, per: 'user-or-ip' as const };

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

/** A kind's tables, checked against the map as well as the schema, so only these literals ever name a table in SQL. */
function kindOf(kind: string): Kind {
  if (!Object.hasOwn(KINDS, kind)) throw new AppError('NOT_FOUND', 404, 'no such recording');
  return KINDS[kind as keyof typeof KINDS];
}

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

export function registerRecordingVoiceRoutes(
  app: FastifyInstance,
  config: Pick<AppConfig, 'CDN_BASE_URL'>,
  fileOptions: RecordingFileOptions = {},
): void {
  const audit = new AuditService(app.db);
  const canRecord = requireRoles(...LESSON_AUDIO_ROLES);
  const files = new RecordingFiles(app.db, app.storage, config, fileOptions);

  registerDictionaryAudioList(app, canRecord);

  app.get(
    '/admin/audio/:kind/file',
    { schema: { params, querystring: query }, config: { rateLimit: BATCH_RATE }, preHandler: canRecord },
    async (req, reply) => {
      const { kind } = req.params as z.infer<typeof params>;
      const { key } = req.query as z.infer<typeof query>;
      const spec = kindOf(kind);
      if (!spec.valid(key)) throw new AppError('NOT_FOUND', 404, spec.missing);
      const signal = AbortSignal.timeout(files.timeoutMs);
      const source =
        spec.table === 'dict_audio'
          ? await files.dictionary(key, spec.missing, signal)
          : await files.stored(spec.table, key, spec.missing, signal);
      return sendAudio(reply, source, signal);
    },
  );

  app.patch(
    '/admin/audio/:kind',
    { schema: { params, querystring: query, body }, config: { rateLimit: BATCH_RATE }, preHandler: canRecord },
    async (req) => {
      const { kind } = req.params as z.infer<typeof params>;
      const { key } = req.query as z.infer<typeof query>;
      const change = req.body as z.infer<typeof body>;
      const spec = kindOf(kind);
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
