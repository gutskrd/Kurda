/**
 * Recordings for the alphabet page, and for the word sets beside it (colours,
 * numbers, days, months): one list of sounds, ALPHABET_CLIPS, and one table.
 *
 *   GET    /alphabet/audio               which sounds have a recording, and where (public)
 *   PUT    /admin/alphabet/audio?key=…   store a recording for one sound (raw audio body)
 *   DELETE /admin/alphabet/audio?key=…   remove it, so the synthesised clip plays again
 *
 * The PUT may say who says the sound, `&speaker=…`, and give its mouth's
 * timeline, `&lipsync=…`, as the lessons' does (speakers/voice.ts); the
 * public list sends both for the recordings with a speaker, under `voices`,
 * with a timeline made from the sound's `say` where none is stored.
 * PATCH /admin/audio/alphabet?key=… changes either later.
 *
 * The admin panel records or takes a file, trims the silence, levels the volume
 * and sends a short mono WAV; the server checks it is one, and no longer than a
 * letter or a word needs. The key travels in the query string because it holds
 * characters (ç, ḧ, the colons) that are awkward in a path segment.
 *
 * Gated to the content roles: this is editing what learners hear, the same
 * kind of work as editing a lesson.
 */
import type { FastifyInstance } from 'fastify';
import {
  ALPHABET_CLIPS,
  ALPHABET_CLIP_MAX_SECONDS,
  isAlphabetClipKey,
  type AlphabetAudioResponse,
  type LipsyncData,
  type RecordingVoice,
  type SpeakerId,
} from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AuditService } from '../admin/audit-service.js';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { registerAudioParser, storeAudioMedia } from '../media/audioMedia.js';
import { audioLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { readWav } from './wav.js';
import {
  fitLipsync,
  lipsyncSummary,
  voiceColumns,
  voiceFromQuery,
  voiceOf,
  type SpokenWords,
} from '../speakers/voice.js';

const KIND = 'alphabet-audio';

/** Who may record: whoever may edit content, plus the legacy catch-all admin. */
export const ALPHABET_AUDIO_ROLES = ['superadmin', 'content_editor', 'admin'] as const;

interface Row {
  key: string;
  url: string;
  duration_ms: number | null;
  updated_at: Date;
  speaker: SpeakerId | null;
  lipsync: LipsyncData | null;
}

const CLIPS = new Map(ALPHABET_CLIPS.map((clip) => [clip.key, clip]));

/** What a sound's recording says, in its script, for a timeline made from its words. */
function wordsOf(row: Pick<Row, 'key' | 'duration_ms'>): SpokenWords | undefined {
  const clip = CLIPS.get(row.key);
  if (!clip) return undefined;
  return { text: clip.say, durationMs: row.duration_ms, script: clip.script === 'ckb' ? 'arabic' : 'latin' };
}

function keyFrom(query: unknown): string {
  const key = typeof (query as { key?: unknown })?.key === 'string' ? (query as { key: string }).key : '';
  if (!isAlphabetClipKey(key)) throw new AppError('UNKNOWN_SOUND', 400, 'no sound on the alphabet or word pages has that key');
  return key;
}

export function registerAlphabetAudioRoutes(app: FastifyInstance, config: AppConfig): void {
  const base = audioLimits(config);
  // a WAV of a few seconds is far under the voice-note cap; the duration check below is the real bound
  const limits = { ...base, allowedTypes: new Set(['audio/wav']) };
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  const audit = new AuditService(app.db);
  const canRecord = requireRoles(...ALPHABET_AUDIO_ROLES);

  registerAudioParser(app, base.maxUploadBytes);

  /** Public: the page asks once, and plays a recording wherever there is one. */
  app.get('/alphabet/audio', async (req, reply): Promise<AlphabetAudioResponse> => {
    const { rows } = await app.db.query<Row>(
      `SELECT key, url, duration_ms, ${voiceColumns()} FROM alphabet_audio ORDER BY key`,
    );
    if (!req.user) reply.header('cache-control', 'public, max-age=60');
    const voices: Record<string, RecordingVoice> = {};
    for (const r of rows) {
      const voice = voiceOf(r, wordsOf(r));
      if (voice) voices[r.key] = voice;
    }
    return {
      clips: Object.fromEntries(rows.map((r) => [r.key, r.url])),
      // only when a sound has a speaker, so the page's payload is what it was until one does
      ...(Object.keys(voices).length > 0 ? { voices } : {}),
    };
  });

  /**
   * The admin list: the same, with when each was recorded and its stored
   * timeline, so the studio can preview the mouth as the apps will move it.
   * A sound or two of seconds each: every timeline together is a few kB.
   */
  app.get('/admin/alphabet/audio', { preHandler: canRecord }, async () => {
    const { rows } = await app.db.query<Row>(
      `SELECT key, url, duration_ms, updated_at, speaker, lipsync FROM alphabet_audio ORDER BY key`,
    );
    return {
      recordings: rows.map((r) => ({
        key: r.key,
        url: r.url,
        durationMs: r.duration_ms,
        updatedAt: r.updated_at,
        speaker: r.speaker,
        hasLipsync: r.lipsync !== null,
        lipsync: r.lipsync,
      })),
    };
  });

  app.put(
    '/admin/alphabet/audio',
    {
      config: {
        rateLimit: { max: 120, windowMs: 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: canRecord,
    },
    async (req, reply) => {
      const key = keyFrom(req.query);
      const voice = voiceFromQuery(req.query);
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_AUDIO', message: 'send the recording as audio/wav' });

      const info = readWav(raw);
      if (!info) return reply.code(415).send({ code: 'INVALID_AUDIO', message: 'send the recording as a PCM WAV file' });
      if (info.durationMs < 150) return reply.code(400).send({ code: 'TOO_SHORT', message: 'the recording is too short to hear' });
      if (info.durationMs > ALPHABET_CLIP_MAX_SECONDS * 1000 + 250) {
        return reply
          .code(400)
          .send({ code: 'TOO_LONG', message: `keep it under ${ALPHABET_CLIP_MAX_SECONDS} seconds: one letter or one word` });
      }
      // checked before the file is stored, so a timeline from another take stores nothing
      const lipsync = voice.lipsync ? fitLipsync(voice.lipsync, info.durationMs) : null;

      const res = await storeAudioMedia({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, KIND, raw);
      if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message });

      const client = await app.db.connect();
      let saved: Row;
      try {
        await client.query('BEGIN');
        const before = await client.query<Row>(`SELECT key, url, speaker FROM alphabet_audio WHERE key = $1 FOR UPDATE`, [key]);
        const upserted = await client.query<Row>(
          `INSERT INTO alphabet_audio (key, media_key, url, content_type, duration_ms, updated_by, updated_at, speaker, lipsync)
           VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8::jsonb)
           ON CONFLICT (key) DO UPDATE SET media_key = EXCLUDED.media_key, url = EXCLUDED.url,
             content_type = EXCLUDED.content_type, duration_ms = EXCLUDED.duration_ms,
             updated_by = EXCLUDED.updated_by, updated_at = now(),
             speaker = CASE WHEN $9::boolean THEN alphabet_audio.speaker ELSE EXCLUDED.speaker END,
             lipsync = EXCLUDED.lipsync
           RETURNING key, url, duration_ms, updated_at, speaker, lipsync`,
          [
            key,
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
          action: 'alphabet.audio.set',
          targetType: 'alphabet_audio',
          targetId: key,
          before: before.rows[0] ? { url: before.rows[0].url, speaker: before.rows[0].speaker } : null,
          after: { url: res.url, durationMs: info.durationMs, speaker: saved.speaker, lipsync: lipsyncSummary(lipsync) },
          requestId: req.id,
        });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return reply
        .code(201)
        .send({ key, url: res.url, durationMs: info.durationMs, speaker: saved.speaker, lipsync: saved.lipsync });
    },
  );

  app.delete('/admin/alphabet/audio', { config: { skipValidation: true }, preHandler: canRecord }, async (req) => {
    const key = keyFrom(req.query);
    const client = await app.db.connect();
    try {
      await client.query('BEGIN');
      const gone = await client.query<Row>(`DELETE FROM alphabet_audio WHERE key = $1 RETURNING key, url`, [key]);
      if (!gone.rows[0]) throw new AppError('NOT_FOUND', 404, 'that sound has no recording');
      await audit.record(client, {
        adminId: req.user!.id,
        action: 'alphabet.audio.remove',
        targetType: 'alphabet_audio',
        targetId: key,
        before: { url: gone.rows[0].url },
        after: null,
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
