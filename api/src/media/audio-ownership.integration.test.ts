/**
 * A member's recording belongs to them, is counted, and does not outlive its
 * use: against real Postgres, with storage held in memory.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadConfig } from '../config/env.js';
import { FakeStorage } from '../test/fake-storage.js';
import { AUDIO_DAILY_UPLOADS, storeAudioMedia, type AudioMediaDeps } from './audioMedia.js';
import { audioLimits } from './mediaLimits.js';
import { MediaUsageService } from './mediaUsage.js';
import { MediaService, ORPHAN_AGE_HOURS } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** An ID3-tagged MP3, as long as asked, different for each `seed`. */
const mp3 = (seed: number, pad = 512): Buffer => Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]), Buffer.alloc(pad, seed % 251), Buffer.from(String(seed))]);

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
    author = await user('recA');
    busy = await user('recB');
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
