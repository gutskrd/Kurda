/** A member's recording belongs to them, is counted, and does not outlive its use; real Postgres, in-memory storage. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadConfig } from '../config/env.js';
import { voiceAttachable } from '../moderation/restrictions.js';
import { FakeStorage } from '../test/fake-storage.js';
import { mp3 as frames } from '../test/audio-files.js';
import { AUDIO_DAILY_UPLOADS, AUDIO_DAILY_UPLOADS_NEW_ACCOUNT, storeAudioMedia, type AudioMediaDeps } from './audioMedia.js';
import { ACCOUNT_STORAGE_LIMIT_BYTES, audioLimits } from './mediaLimits.js';
import { MediaUsageService } from './mediaUsage.js';
import { MediaService, ORPHAN_AGE_HOURS } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** A short MP3, different for each `seed`. */
const mp3 = (seed: number): Buffer => frames(10, seed);

describe.skipIf(!DATABASE_URL)('a member’s recordings (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const suffix = Date.now().toString(36);
  const storage = new FakeStorage();
  let pool: pg.Pool;
  let deps: AudioMediaDeps;
  let author = '';
  let busy = '';

  const user = async (name: string): Promise<string> => {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, email_verified_at) VALUES ($1, $2, now()) RETURNING id`,
      [`${name}_${suffix}@it.kurda.app`, `${name}_${suffix}`.slice(0, 30)],
    );
    return row.rows[0]!.id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    deps = { pool, storage: storage.asStorage, usage: new MediaUsageService(pool, null), limits: audioLimits(config), log: { warn: () => {}, error: () => {} } };
    author = await user('reca');
    busy = await user('recb');
    // past their first week, so the ordinary day's recordings apply
    await pool.query(`UPDATE users SET created_at = now() - interval '30 days' WHERE id = ANY($1::uuid[])`, [[author, busy]]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM media_uploads WHERE uploader_id = ANY($1::uuid[]) OR key LIKE $2`, [[author, busy], `%${suffix}%`]);
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
  });

  it('keeps a recording under its uploader’s name, and the course’s audio under nobody’s', async () => {
    const mine = await storeAudioMedia(deps, 'voice-note', mp3(1), author);
    const lesson = await storeAudioMedia(deps, 'lesson-audio', mp3(2), null);
    expect(mine.ok && lesson.ok).toBe(true);
    if (!mine.ok || !lesson.ok) return;
    const owners = await pool.query<{ key: string; uploader_id: string | null }>(`SELECT key, uploader_id FROM media_uploads WHERE key = ANY($1)`, [[mine.mediaId, lesson.mediaId]]);
    expect(owners.rows.find((r) => r.key === mine.mediaId)?.uploader_id).toBe(author);
    // it must not go when the person who recorded it closes their account
    expect(owners.rows.find((r) => r.key === lesson.mediaId)?.uploader_id).toBeNull();
    await pool.query(`DELETE FROM media_uploads WHERE key = $1`, [lesson.mediaId]);
  });

  it('stops one account at a day’s worth of recordings, and nobody else with it', async () => {
    for (let i = 0; i < AUDIO_DAILY_UPLOADS; i++) {
      const res = await storeAudioMedia(deps, 'voice-note', mp3(100 + i), busy);
      expect(res.ok, `upload ${i}`).toBe(true);
    }
    const over = await storeAudioMedia(deps, 'voice-note', mp3(999), busy);
    expect(over).toMatchObject({ ok: false, status: 429, code: 'MEDIA_DAILY_LIMIT_REACHED' });
    // another account is not held back by it, and staff recording the course are not counted at all
    expect((await storeAudioMedia(deps, 'voice-note', mp3(1000), author)).ok).toBe(true);
    const lesson = await storeAudioMedia(deps, 'lesson-audio', mp3(1001), null);
    expect(lesson.ok).toBe(true);
    if (lesson.ok) await pool.query(`DELETE FROM media_uploads WHERE key = $1`, [lesson.mediaId]);
  });

  it('gives an account in its first week only a few recordings a day', async () => {
    const fresh = await user('recn');
    try {
      for (let i = 0; i < AUDIO_DAILY_UPLOADS_NEW_ACCOUNT; i++) expect((await storeAudioMedia(deps, 'voice-note', mp3(4000 + i), fresh)).ok, `upload ${i}`).toBe(true);
      expect(await storeAudioMedia(deps, 'voice-note', mp3(4999), fresh)).toMatchObject({ ok: false, status: 429, code: 'MEDIA_DAILY_LIMIT_REACHED' });
    } finally {
      await pool.query(`DELETE FROM media_uploads WHERE uploader_id = $1`, [fresh]);
    }
  });

  it('stops an account whose uploads fill its share of storage, and nobody else with it', async () => {
    const full = await user('recs');
    try {
      await pool.query(
        `INSERT INTO media_uploads (key, content_type, content_length, kind, uploader_id, confirmed_at, scan_status)
         VALUES ($1, 'audio/mpeg', $2, 'voice-note', $3, now(), 'cleared')`,
        [`voice-note/${suffix}-full.mp3`, ACCOUNT_STORAGE_LIMIT_BYTES - 100, full],
      );
      expect(await storeAudioMedia(deps, 'voice-note', mp3(5001), full)).toMatchObject({
        ok: false,
        status: 507,
        code: 'MEDIA_STORAGE_LIMIT_REACHED',
        reason: 'account-storage-limit',
      });
      expect((await storeAudioMedia(deps, 'voice-note', mp3(5002), author)).ok).toBe(true);
    } finally {
      await pool.query(`DELETE FROM media_uploads WHERE uploader_id = $1`, [full]);
    }
  });

  it('gives two people sending the same file an upload each, and refuses it to anyone once moderation takes one down', async () => {
    const [first, second, third] = [await user('recd'), await user('rece'), await user('recf')];
    const bytes = mp3(3001);
    try {
      const a = await storeAudioMedia(deps, 'voice-note', bytes, first);
      const b = await storeAudioMedia(deps, 'voice-note', bytes, second);
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.mediaId).not.toBe(b.mediaId);
      // each is its uploader's to attach, and nobody else's
      expect(await voiceAttachable(pool, first, a.mediaId)).toBe(true);
      expect(await voiceAttachable(pool, second, a.mediaId)).toBe(false);
      expect(await voiceAttachable(pool, second, b.mediaId)).toBe(true);
      // the same person sending it again is the same upload
      expect(await storeAudioMedia(deps, 'voice-note', bytes, first)).toMatchObject({ ok: true, mediaId: a.mediaId, reused: true });

      await pool.query(`UPDATE media_uploads SET quarantine_state = 'done' WHERE key = $1`, [a.mediaId]);
      expect(await storeAudioMedia(deps, 'voice-note', bytes, third)).toMatchObject({ ok: false, code: 'MEDIA_REJECTED' });
    } finally {
      await pool.query(`DELETE FROM media_uploads WHERE uploader_id = ANY($1::uuid[])`, [[first, second, third]]);
    }
  });

  it('removes a recording nobody posted after a day, and keeps one a comment or a post holds', async () => {
    const service = new MediaService(pool, storage.asStorage);
    const unposted = await storeAudioMedia(deps, 'voice-note', mp3(2001), author);
    const posted = await storeAudioMedia(deps, 'voice-note', mp3(2002), author);
    expect(unposted.ok && posted.ok).toBe(true);
    if (!unposted.ok || !posted.ok) return;
    const post = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, audio_media_id, language, status)
       VALUES ($1, 'user', 'story', $2, 'Rojek…', $3, 'kmr', 'draft') RETURNING id`,
      [author, `rec ${suffix}`, posted.mediaId],
    );

    // within the day nothing goes: it may still be on its way into a post
    await service.cleanupOrphans(new Date());
    expect(await storage.exists(unposted.mediaId)).toBe(true);

    await service.cleanupOrphans(new Date(Date.now() + (ORPHAN_AGE_HOURS + 1) * 3_600_000));
    expect(await storage.exists(unposted.mediaId)).toBe(false);
    expect((await pool.query(`SELECT 1 FROM media_uploads WHERE key = $1`, [unposted.mediaId])).rowCount).toBe(0);
    // the one a post holds, even a draft, is untouched and still confirmed
    expect(await storage.exists(posted.mediaId)).toBe(true);
    const kept = await pool.query<{ confirmed: boolean }>(`SELECT confirmed_at IS NOT NULL AS confirmed FROM media_uploads WHERE key = $1`, [posted.mediaId]);
    expect(kept.rows[0]?.confirmed).toBe(true);
    await pool.query(`DELETE FROM library_posts WHERE id = $1`, [post.rows[0]!.id]);
  });
});
