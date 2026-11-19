/**
 * Native recordings of the Kurdish lessons use, the "Lessons" side of the admin audio studio:
 *
 *   GET    /admin/lesson-audio            needs, recordings, usages and planned speakers (&withLipsync=1 adds timelines)
 *   PUT    /admin/lesson-audio?text=…     store a recording of that text (raw audio/wav body)
 *   DELETE /admin/lesson-audio?key=…      remove one (&force=1 when a published listening item plays it)
 *   GET    /admin/lesson-audio/conversations/:id?lesson=…   one conversation's lines and takes, for its recording page
 *
 * A conversation line is recorded with `&line=<conversation id>:<part>` and filed under that part
 * (`conversationLineKey`), so the same words in another part or conversation stay separate; a reaction line with
 * `&reaction=<character>:<id>`, filed by `reactionKey` and only with the catalogue's words. The PUT may name the
 * speaker (`&speaker=hevalo|hamo|xezo|none`) and the lip-sync timeline (`&lipsync=`, speakers/voice.ts); without a
 * speaker the new take keeps the old one's, and without a timeline it has none. PATCH /admin/audio/lesson changes
 * either later.
 *
 * There is no public list: learners get recordings with the exercises and stories that use them. Any text may be
 * recorded, so an editor can record ahead of a lesson. The panel sends a trimmed, levelled short mono WAV, which the
 * server checks; the text travels in the query string because it holds characters awkward in a path. Only the PUT is
 * also open to voice actors, for the lines linked to them (recording/access.ts).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CONVERSATION_ID,
  LESSON_AUDIO_MAX_SECONDS,
  LESSON_AUDIO_TEXT_MAX,
  conversationLineKey,
  isReactionKey,
  lessonAudioKey,
  normalizeKurdish,
  reactionKey,
  reactionLine,
  type LipsyncData,
  type ReactionCharacter,
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
import { readWav } from '../media/wav.js';
import { LessonAudioService } from './service.js';
import { lessonsPlaying } from './publish-guard.js';
import { bustStoryLists } from '../stories/service.js';
import { bustReactions } from './reactions.js';
import { fitLipsync, lipsyncSummary, voiceFromQuery } from '../speakers/voice.js';
import { RECORDING_ROLES, assertMayRecord } from '../recording/access.js';

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
const textQuery = z.object({ text: z.string(), line: z.string().max(64).optional(), reaction: z.string().max(64).optional() });
const conversationParams = z.object({ id: z.string().regex(CONVERSATION_ID) });
const conversationQuery = z.object({ lesson: z.uuid().optional() });
/** `<conversation id>:<part>`, the part being who says the line, by place */
const LINE = /^([a-z0-9]{6,32}):(\d{1,2})$/;
/** `<character>:<id>` of a reaction line */
const REACTION = /^([a-z]{1,12}):([a-z0-9-]{1,40})$/;
const keyQuery = z.object({ key: z.string().min(1).max(LESSON_AUDIO_TEXT_MAX * 2), force: z.string().optional() });

/** The text to record as typed (NFC, spaces evened) and its key: a conversation line's when `line` names one, a reaction's when `reaction` does. */
function textFrom(query: unknown): {
  text: string;
  key: string;
  line: { conversation: string; part: number } | null;
  reaction: { character: ReactionCharacter; id: string } | null;
} {
  const parsed = textQuery.safeParse(query);
  const text = parsed.success ? normalizeKurdish(parsed.data.text) : '';
  if (!lessonAudioKey(text)) throw new AppError('EMPTY_TEXT', 400, 'say which text this is a recording of');
  if (text.length > LESSON_AUDIO_TEXT_MAX) {
    throw new AppError('TEXT_TOO_LONG', 400, `keep the text under ${LESSON_AUDIO_TEXT_MAX} characters`);
  }
  const { line: named, reaction: said } = parsed.data ?? {};
  if (named !== undefined && said !== undefined) throw new AppError('INVALID_LINE', 400, 'name a conversation line or a reaction, not both');
  if (said !== undefined) {
    const m = REACTION.exec(said);
    const found = m ? reactionLine(m[1]!, m[2]!) : null;
    if (!found) throw new AppError('UNKNOWN_REACTION', 400, 'name the reaction as <character>:<id> from the catalogue');
    if (lessonAudioKey(found.ku) !== lessonAudioKey(text)) throw new AppError('REACTION_TEXT', 400, `this reaction says “${found.ku}”`);
    return { text, key: reactionKey(found), line: null, reaction: { character: found.character, id: found.id } };
  }
  if (named === undefined) return { text, key: lessonAudioKey(text), line: null, reaction: null };
  const m = LINE.exec(named);
  if (!m) throw new AppError('INVALID_LINE', 400, 'name the line as <conversation id>:<part>');
  const line = { conversation: m[1]!, part: Number(m[2]) };
  return { text, key: conversationLineKey(line.conversation, line.part, text), line, reaction: null };
}

/** `onTake` runs after every saved take without delaying the answer; road chapters go online once their last line is recorded. */
export function registerLessonAudioRoutes(app: FastifyInstance, config: AppConfig, onTake: () => void = () => undefined): void {
  const base = audioLimits(config);
  // a WAV of a sentence is far under the voice-note cap; the duration check below is the real bound
  const limits = { ...base, allowedTypes: new Set(['audio/wav']) };
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  const audit = new AuditService(app.db);
  const service = new LessonAudioService(app.db);
  const canRecord = requireRoles(...LESSON_AUDIO_ROLES);
  // Voice actors may upload takes for the lines linked to their account (recording/access.ts).
  const canTake = requireRoles(...RECORDING_ROLES);

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
        rawBody: true,
        // A recording session walks hundreds of short items, so this allows several times the alphabet's pace; storage and
        // media op ceilings still bound the cost.
        rateLimit: { max: 600, windowMs: 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: canTake,
    },
    async (req, reply) => {
      const { text, key, line, reaction } = textFrom(req.query);
      await assertMayRecord(app, req, 'lesson', key);
      const voice = voiceFromQuery(req.query);
      // A reaction is always its own character's, whoever the upload names.
      if (reaction) voice.speaker = reaction.character;
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

      // the course's audio: it has no uploader, so it never goes with the account of whoever recorded it
      const res = await storeAudioMedia({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, KIND, raw, null);
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
            ...(reaction ? { reaction } : {}),
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
      // A story's "fully narrated" badge or a chapter's completion may have just changed, or the apps' reactions.
      await bustStoryLists(app.cache);
      if (reaction) await bustReactions(app.cache);
      onTake();
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
      // Lock the row before checking who plays it: an approve that just checked this recording holds it until it commits,
      // so its lesson is published and seen below.
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
    if (isReactionKey(key)) await bustReactions(app.cache);
    // the file stays in storage: it is content-addressed and may be put back
    return { key, removed: true };
  });
}
