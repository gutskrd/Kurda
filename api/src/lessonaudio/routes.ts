/**
 * Native recordings of the Kurdish that lessons use — the "Lessons" side of
 * the admin's audio studio, beside the alphabet's recordings.
 *
 *   GET    /admin/lesson-audio            what the lessons need, what is recorded, where each is used
 *                                         (&withLipsync=1: each with its stored timeline, or null)
 *   PUT    /admin/lesson-audio?text=…     store a recording of that text (raw audio/wav body)
 *   DELETE /admin/lesson-audio?key=…      remove one (&force=1 when a published listening item plays it)
 *   GET    /admin/lesson-audio/conversations/:id?lesson=…
 *                                         one conversation's lines and their recordings, with who made each:
 *                                         the page each person records their part on
 *
 * A conversation's line is recorded with `&line=<conversation id>:<part>`
 * beside the text: its recording is the conversation's own, filed under who
 * says it (`conversationLineKey`), so the same words said by the other part,
 * or in another conversation, stay a recording of their own.
 *
 * The PUT may also say who says the recording and how their mouth moves, as
 * `&speaker=hevalo|hamo|xezo|none` and `&lipsync=<the timeline as JSON>`
 * (speakers/voice.ts). Without a speaker the new take keeps the old one's;
 * without a timeline it has none, since the old timeline was the old take's.
 * PATCH /admin/audio/lesson?key=… changes either later (speakers/routes.ts).
 *
 * There is no public list: learners get the recordings with the exercises that
 * use them (lessonaudio/delivery.ts), and with the stories that say them
 * (GET /stories/:idOrSlug). Any text may be recorded, not only one a
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
import {
  CONVERSATION_ID,
  LESSON_AUDIO_MAX_SECONDS,
  LESSON_AUDIO_TEXT_MAX,
  conversationLineKey,
  lessonAudioKey,
  normalizeKurdish,
  type LipsyncData,
  type SpeakerId,
} from '@kurda/shared';
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
import { bustStoryLists } from '../stories/service.js';
import { fitLipsync, lipsyncSummary, voiceFromQuery } from '../speakers/voice.js';

const KIND = 'lesson-audio';

/** The same people who record the alphabet: whoever may edit content. */
export const LESSON_AUDIO_ROLES = ALPHABET_AUDIO_ROLES;

interface Row {
  key: string;
  text: string;
  url: string;
  duration_ms: number;
  updated_at: Date;
  speaker: SpeakerId | null;
  lipsync: LipsyncData | null;
}

const listQuery = z.object({ withLipsync: z.enum(['0', '1', 'false', 'true']).optional() });
const textQuery = z.object({ text: z.string(), line: z.string().max(64).optional() });
const conversationParams = z.object({ id: z.string().regex(CONVERSATION_ID) });
const conversationQuery = z.object({ lesson: z.uuid().optional() });
/** `<conversation id>:<part>`, the part being who says the line, by place */
const LINE = /^([a-z0-9]{6,32}):(\d{1,2})$/;
const keyQuery = z.object({ key: z.string().min(1).max(LESSON_AUDIO_TEXT_MAX * 2), force: z.string().optional() });

/**
 * The text to record, as typed (NFC, spaces evened out), and its key: a
 * conversation line's when `line` names one, else the text's own.
 */
function textFrom(query: unknown): { text: string; key: string; line: { conversation: string; part: number } | null } {
  const parsed = textQuery.safeParse(query);
  const text = parsed.success ? normalizeKurdish(parsed.data.text) : '';
  if (!lessonAudioKey(text)) throw new AppError('EMPTY_TEXT', 400, 'say which text this is a recording of');
  if (text.length > LESSON_AUDIO_TEXT_MAX) {
    throw new AppError('TEXT_TOO_LONG', 400, `keep the text under ${LESSON_AUDIO_TEXT_MAX} characters`);
  }
  if (parsed.data?.line === undefined) return { text, key: lessonAudioKey(text), line: null };
  const m = LINE.exec(parsed.data.line);
  if (!m) throw new AppError('INVALID_LINE', 400, 'name the line as <conversation id>:<part>');
  const line = { conversation: m[1]!, part: Number(m[2]) };
  return { text, key: conversationLineKey(line.conversation, line.part, text), line };
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

  app.get('/admin/lesson-audio', { schema: { querystring: listQuery }, preHandler: canRecord }, async (req) => {
    const { withLipsync } = req.query as z.infer<typeof listQuery>;
    return service.list({ withLipsync: withLipsync === '1' || withLipsync === 'true' });
  });

  app.get(
    '/admin/lesson-audio/conversations/:id',
    { schema: { params: conversationParams, querystring: conversationQuery }, preHandler: canRecord },
    async (req) => {
      const { id } = req.params as z.infer<typeof conversationParams>;
      const { lesson } = req.query as z.infer<typeof conversationQuery>;
      const found = await service.conversation(id, lesson ?? null);
      if (!found) throw new AppError('NOT_FOUND', 404, 'no lesson has that conversation');
      return found;
    },
  );

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
      const { text, key, line } = textFrom(req.query);
      const voice = voiceFromQuery(req.query);
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
      // checked before the file is stored, so a timeline from another take stores nothing
      const lipsync = voice.lipsync ? fitLipsync(voice.lipsync, info.durationMs) : null;

      const res = await storeAudioMedia({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, KIND, raw);
      if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message });

      const client = await app.db.connect();
      let saved: Row;
      try {
        await client.query('BEGIN');
        const before = await client.query<Row>(
          `SELECT key, text, url, speaker FROM lesson_audio WHERE key = $1 FOR UPDATE`,
          [key],
        );
        const upserted = await client.query<Row>(
          `INSERT INTO lesson_audio
             (key, text, media_key, url, content_type, duration_ms, recorded_by, updated_at, speaker, lipsync)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9::jsonb)
           ON CONFLICT (key) DO UPDATE SET text = EXCLUDED.text, media_key = EXCLUDED.media_key, url = EXCLUDED.url,
             content_type = EXCLUDED.content_type, duration_ms = EXCLUDED.duration_ms,
             recorded_by = EXCLUDED.recorded_by, updated_at = now(),
             speaker = CASE WHEN $10::boolean THEN lesson_audio.speaker ELSE EXCLUDED.speaker END,
             lipsync = EXCLUDED.lipsync
           RETURNING key, text, url, duration_ms, updated_at, speaker, lipsync`,
          [
            key,
            text,
            res.mediaId,
            res.url,
            res.contentType,
            info.durationMs,
            req.user!.id,
            voice.speaker ?? null,
            lipsync === null ? null : JSON.stringify(lipsync),
            voice.speaker === undefined,
          ],
        );
        saved = upserted.rows[0]!;
        await audit.record(client, {
          adminId: req.user!.id,
          action: 'lesson.audio.set',
          targetType: 'lesson_audio',
          targetId: key,
          before: before.rows[0]
            ? { text: before.rows[0].text, url: before.rows[0].url, speaker: before.rows[0].speaker }
            : null,
          after: {
            text,
            ...(line ? { line } : {}),
            url: res.url,
            durationMs: info.durationMs,
            speaker: saved.speaker,
            lipsync: lipsyncSummary(lipsync),
          },
          requestId: req.id,
        });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      // a story's "fully narrated" badge may have just changed
      await bustStoryLists(app.cache);
      return reply.code(201).send({
        key: saved.key,
        text: saved.text,
        url: saved.url,
        durationMs: saved.duration_ms,
        updatedAt: saved.updated_at.toISOString(),
        speaker: saved.speaker,
        lipsync: saved.lipsync,
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
    await bustStoryLists(app.cache);
    // the file stays in storage: it is content-addressed and may be put back
    return { key, removed: true };
  });
}
