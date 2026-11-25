/**
 * Recordings for the alphabet page and the word sets beside it (colours, numbers, days, months), one per sound in
 * ALPHABET_CLIPS. `GET /alphabet/audio` is public; the admin PUT stores a short mono WAV for one sound, optionally
 * with its speaker and lip-sync timeline, and DELETE brings back the synthesised clip. The key travels in the query
 * string because it holds characters (ç, ḧ, colons) that are awkward in a path. Editing is for the content roles;
 * the PUT is also open to voice actors recording their linked lines. A word with no take of its own plays the same
 * word's take from elsewhere (`borrowedAlphabetTake`), so nobody records it twice.
 */
import type { FastifyInstance } from 'fastify';
import {
  ALPHABET_CLIPS,
  ALPHABET_CLIP_MAX_SECONDS,
  alphabetClipWord,
  borrowedAlphabetTake,
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
import { readWav } from '../media/wav.js';
import { RECORDING_ROLES, assertMayRecord } from '../recording/access.js';
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
function wordsOf(key: string, durationMs: number | null): SpokenWords | undefined {
  const clip = CLIPS.get(key);
  if (!clip) return undefined;
  return { text: clip.say, durationMs, script: clip.script === 'ckb' ? 'arabic' : 'latin' };
}

/** The lesson recordings a word on these pages may borrow, by the word as a lesson recording is keyed. */
const LESSON_WORDS = [...new Set(ALPHABET_CLIPS.flatMap((clip) => alphabetClipWord(clip) ?? []))];

/**
 * Every take the pages play, by clip key: each clip's own, else the one it borrows (`from` says where), read with the
 * columns `columns` names from both tables.
 */
export async function takesWithBorrowed(db: FastifyInstance['db'], columns: string): Promise<Array<{ key: string; row: Row; from: { store: 'alphabet' | 'lesson'; key: string } | null }>> {
  const [own, lessons] = await Promise.all([
    db.query<Row>(`SELECT key, ${columns} FROM alphabet_audio ORDER BY key`),
    db.query<Row>(`SELECT key, ${columns} FROM lesson_audio WHERE key = ANY($1::text[])`, [LESSON_WORDS]),
  ]);
  const ownByKey = new Map(own.rows.map((r) => [r.key, r]));
  const lessonByKey = new Map(lessons.rows.map((r) => [r.key, r]));
  const out: Array<{ key: string; row: Row; from: { store: 'alphabet' | 'lesson'; key: string } | null }> = own.rows.map((row) => ({ key: row.key, row, from: null }));
  for (const clip of ALPHABET_CLIPS) {
    const borrowed = borrowedAlphabetTake(clip, ownByKey, lessonByKey);
    if (borrowed) out.push({ key: clip.key, row: borrowed.take, from: { store: borrowed.store, key: borrowed.key } });
  }
  return out;
}

function keyFrom(query: unknown): string {
  const key = typeof (query as { key?: unknown })?.key === 'string' ? (query as { key: string }).key : '';
  if (!isAlphabetClipKey(key)) throw new AppError('UNKNOWN_SOUND', 400, 'no sound on the alphabet or word pages has that key');
  return key;
}

export function registerAlphabetAudioRoutes(app: FastifyInstance, config: AppConfig): void {
  const base = audioLimits(config);
  // The duration check below is the real bound; a short WAV is far under the voice-note cap.
  const limits = { ...base, allowedTypes: new Set(['audio/wav']) };
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  const audit = new AuditService(app.db);
  const canRecord = requireRoles(...ALPHABET_AUDIO_ROLES);
  // Voice actors may upload takes for the lines linked to their account (recording/access.ts).
  const canTake = requireRoles(...RECORDING_ROLES);

  registerAudioParser(app, base.maxUploadBytes);

  /** Public: the page asks once, and plays a recording wherever there is one. */
  app.get('/alphabet/audio', async (req, reply): Promise<AlphabetAudioResponse> => {
    const takes = await takesWithBorrowed(app.db, `url, duration_ms, ${voiceColumns()}`);
    if (!req.user) reply.header('cache-control', 'public, max-age=60');
    const voices: Record<string, RecordingVoice> = {};
    for (const t of takes) {
      const voice = voiceOf(t.row, wordsOf(t.key, t.row.duration_ms));
      if (voice) voices[t.key] = voice;
    }
    return {
      clips: Object.fromEntries(takes.map((t) => [t.key, t.row.url])),
      // Sent only once a sound has a speaker, so the payload is unchanged until then.
      ...(Object.keys(voices).length > 0 ? { voices } : {}),
    };
  });

  /**
   * The admin list: the public one plus when each was recorded and its stored timeline, for previewing the mouth. A
   * word that plays another key's take is listed under `borrowed` with where it comes from, so nobody records it again.
   */
  app.get('/admin/alphabet/audio', { preHandler: canRecord }, async () => {
    const takes = await takesWithBorrowed(app.db, 'url, duration_ms, updated_at, speaker, lipsync');
    const shown = (t: (typeof takes)[number]) => ({
      key: t.key,
      url: t.row.url,
      durationMs: t.row.duration_ms,
      updatedAt: t.row.updated_at,
      speaker: t.row.speaker,
      hasLipsync: t.row.lipsync !== null,
      lipsync: t.row.lipsync,
    });
    return {
      recordings: takes.filter((t) => t.from === null).map(shown),
      borrowed: takes.flatMap((t) => (t.from ? [{ ...shown(t), from: t.from }] : [])),
    };
  });

  app.put(
    '/admin/alphabet/audio',
    {
      config: {
        rawBody: true,
        rateLimit: { max: 120, windowMs: 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: canTake,
    },
    async (req, reply) => {
      const key = keyFrom(req.query);
      await assertMayRecord(app, req, 'alphabet', key);
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

      // the course's audio: it has no uploader, so it never goes with the account of whoever recorded it
      const res = await storeAudioMedia({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, KIND, raw, null);
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
