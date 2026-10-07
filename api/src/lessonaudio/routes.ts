/**
 * Native recordings of the Kurdish that lessons use — the "Lessons" side of
 * the admin's audio studio, beside the alphabet's recordings.
 *
 *   GET    /admin/lesson-audio            what the lessons need, what is recorded, where each is used
 *   PUT    /admin/lesson-audio?text=…     store a recording of that text (raw audio/wav body)
 *   DELETE /admin/lesson-audio?key=…      remove one (&force=1 when a published listening item plays it)
 *
 * There is no public list: learners get the recordings with the exercises that
 * use them (lessonaudio/delivery.ts). Any text may be recorded, not only one a
 * lesson uses today, so an editor can record a phrase before the lesson that
 * needs it is written.
 *
 * The admin panel records or takes a file, trims the silence, levels the
 * volume and sends a short mono WAV; the server checks it is one, and no
 * longer than a sentence needs. The text travels in the query string, as the
 * alphabet's key does, because it holds characters awkward in a path.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LESSON_AUDIO_MAX_SECONDS, LESSON_AUDIO_TEXT_MAX, lessonAudioKey, normalizeKurdish } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AuditService } from '../admin/audit-service.js';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { registerAudioParser, storeAudioMedia } from '../media/audioMedia.js';
import { audioLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { ALPHABET_AUDIO_ROLES } from '../alphabet/routes.js';
import { readWav } from '../alphabet/wav.js';
import { LessonAudioService } from './service.js';
import { lessonsPlaying } from './publish-guard.js';

const KIND = 'lesson-audio';

/** The same people who record the alphabet: whoever may edit content. */
export const LESSON_AUDIO_ROLES = ALPHABET_AUDIO_ROLES;

interface Row {
  key: string;
  text: string;
  url: string;
  duration_ms: number;
  updated_at: Date;
}

const textQuery = z.object({ text: z.string() });
const keyQuery = z.object({ key: z.string().min(1).max(LESSON_AUDIO_TEXT_MAX * 2), force: z.string().optional() });

/** The text to record, as typed (NFC, spaces evened out), and its key. */
function textFrom(query: unknown): { text: string; key: string } {
  const parsed = textQuery.safeParse(query);
  const text = parsed.success ? normalizeKurdish(parsed.data.text) : '';
  const key = lessonAudioKey(text);
  if (!key) throw new AppError('EMPTY_TEXT', 400, 'say which text this is a recording of');
  if (text.length > LESSON_AUDIO_TEXT_MAX) {
    throw new AppError('TEXT_TOO_LONG', 400, `keep the text under ${LESSON_AUDIO_TEXT_MAX} characters`);
  }
  return { text, key };
}

export function registerLessonAudioRoutes(app: FastifyInstance, config: AppConfig): void {
  const base = audioLimits(config);
  // a WAV of a sentence is far under the voice-note cap; the duration check below is the real bound
  const limits = { ...base, allowedTypes: new Set(['audio/wav']) };
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  const audit = new AuditService(app.db);
  const service = new LessonAudioService(app.db);
  const canRecord = requireRoles(...LESSON_AUDIO_ROLES);

  registerAudioParser(app, base.maxUploadBytes);

  app.get('/admin/lesson-audio', { preHandler: canRecord }, async () => service.list());

  app.put(
    '/admin/lesson-audio',
    {
      config: {
        // a recording session walks hundreds of short items, a few seconds
        // each, so this allows several times the alphabet's pace; storage and
        // the media op ceilings still bound what it can cost
        rateLimit: { max: 600, windowMs: 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: canRecord,
    },
    async (req, reply) => {
      const { text, key } = textFrom(req.query);
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_AUDIO', message: 'send the recording as audio/wav' });

      const info = readWav(raw);
      if (!info) return reply.code(415).send({ code: 'INVALID_AUDIO', message: 'send the recording as a PCM WAV file' });
      // one voice: a stereo file is two takes of it, or a room, and the panel always sends mono
      if (info.channels !== 1) return reply.code(400).send({ code: 'NOT_MONO', message: 'send a mono recording' });
      if (info.durationMs < 150) return reply.code(400).send({ code: 'TOO_SHORT', message: 'the recording is too short to hear' });
      if (info.durationMs > LESSON_AUDIO_MAX_SECONDS * 1000 + 250) {
        return reply
          .code(400)
          .send({ code: 'TOO_LONG', message: `keep it under ${LESSON_AUDIO_MAX_SECONDS} seconds: one sentence` });
      }

      const res = await storeAudioMedia({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, KIND, raw);
      if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message });

      const client = await app.db.connect();
      let saved: Row;
      try {
        await client.query('BEGIN');
        const before = await client.query<Row>(`SELECT key, text, url FROM lesson_audio WHERE key = $1 FOR UPDATE`, [key]);
        const upserted = await client.query<Row>(
          `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms, recorded_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (key) DO UPDATE SET text = EXCLUDED.text, media_key = EXCLUDED.media_key, url = EXCLUDED.url,
             content_type = EXCLUDED.content_type, duration_ms = EXCLUDED.duration_ms,
             recorded_by = EXCLUDED.recorded_by, updated_at = now()
           RETURNING key, text, url, duration_ms, updated_at`,
          [key, text, res.mediaId, res.url, res.contentType, info.durationMs, req.user!.id],
        );
        saved = upserted.rows[0]!;
        await audit.record(client, {
          adminId: req.user!.id,
          action: 'lesson.audio.set',
          targetType: 'lesson_audio',
          targetId: key,
          before: before.rows[0] ? { text: before.rows[0].text, url: before.rows[0].url } : null,
          after: { text, url: res.url, durationMs: info.durationMs },
          requestId: req.id,
        });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return reply.code(201).send({
        key: saved.key,
        text: saved.text,
        url: saved.url,
        durationMs: saved.duration_ms,
        updatedAt: saved.updated_at.toISOString(),
      });
    },
  );

  app.delete('/admin/lesson-audio', { config: { skipValidation: true }, preHandler: canRecord }, async (req) => {
    const parsed = keyQuery.safeParse(req.query);
    if (!parsed.success) throw new AppError('EMPTY_KEY', 400, 'say which recording to remove');
    const { key } = parsed.data;
    const force = parsed.data.force === '1' || parsed.data.force === 'true';
    const client = await app.db.connect();
    try {
      await client.query('BEGIN');
      // lock the row before asking who plays it: an approve that has just
      // checked this recording holds it until it commits, so its lesson is
      // published (and seen below) before this goes on
      const found = await client.query(`SELECT 1 FROM lesson_audio WHERE key = $1 FOR UPDATE`, [key]);
      if (found.rowCount === 0) throw new AppError('NOT_FOUND', 404, 'that text has no recording');
      // a published listening item with no clip of its own plays this: without it, it plays nothing
      const lessons = await lessonsPlaying(client, key);
      if (lessons.length > 0 && !force) {
        const named = lessons
          .slice(0, 3)
          .map((l) => `“${l.title}”`)
          .join(', ');
        const more = lessons.length > 3 ? ` and ${lessons.length - 3} more` : '';
        throw new AppError(
          'LISTENING_AUDIO_IN_USE',
          409,
          `A listening item in ${named}${more} has no clip of its own and plays this recording: without it, learners have nothing to hear.`,
          { lessons },
        );
      }
      const gone = await client.query<Row>(`DELETE FROM lesson_audio WHERE key = $1 RETURNING key, text, url`, [key]);
      const removed = gone.rows[0]!;
      await audit.record(client, {
        adminId: req.user!.id,
        action: 'lesson.audio.remove',
        targetType: 'lesson_audio',
        targetId: key,
        before: { text: removed.text, url: removed.url },
        after: null,
        reason: lessons.length > 0 ? `a listening item in ${lessons.length} published lesson(s) played it` : null,
        requestId: req.id,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    // the file stays in storage: it is content-addressed and may be put back
    return { key, removed: true };
  });
}
