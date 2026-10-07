/**
 * Closing an account found to be a child's removes the child's data, against
 * real Postgres.
 *
 * The client tells a child "your account has been closed and your personal
 * details removed", so this seeds an account with the things a child could
 * have put in it — a photo, a post with a voice recording and a picture, a
 * voice comment on somebody else's post, messages, a group, friends, a phone,
 * analytics and consent — closes it the way the one-time birth month question
 * does, and checks that each of them is gone, while other people's posts,
 * replies and groups stay whole and files somebody else uses stay stored.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { canonicalPair } from '../friends/pair.js';
import type { MediaStorage } from '../media/storage.js';
import { GdprService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Account {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('closing a child’s account (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.145.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const closed: string[] = [];
  const evidence: string[] = [];
  const files: string[] = [];

  const signUp = async (tag: string): Promise<Account> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ce_${tag}_${suffix}@it.kurda.app`,
        username: `ce_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  /** A key shaped like the real ones: a kind and a content hash. */
  const key = (kind: string, tag: string, ext: string) =>
    `${kind}/${Buffer.from(`${tag}-${suffix}`).toString('hex').padEnd(64, '0').slice(0, 64)}.${ext}`;

  const stored = async (k: string) => {
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at) VALUES ($1, 'image/png', 10, now())
       ON CONFLICT (key) DO NOTHING`,
      [k],
    );
  };

  /**
   * An account with something of everything in it, and an adult friend
   * around it. The birth month is removed afterwards, as for an account made
   * before the question.
   */
  const seedChild = async (tag: string) => {
    const child = await signUp(`${tag}kid`);
    const friend = await signUp(`${tag}pal`);
    closed.push(child.id);
    const keys = {
      photo: key('avatar', `${tag}-photo`, 'png'),
      voice: key('voice', `${tag}-voice`, 'webm'),
      picture: key('image', `${tag}-picture`, 'png'),
      commentVoice: key('voice', `${tag}-comment`, 'webm'),
      shared: key('avatar', `${tag}-shared`, 'png'),
      evidence: key('image', `${tag}-evidence`, 'png'),
    };
    for (const k of Object.values(keys)) await stored(k);
    files.push(...Object.values(keys));
    evidence.push(keys.evidence);

    await pool.query(
      `UPDATE users SET profile_photo_key = $2, country = 'SE', analytics_consent = true,
              consent_version = '2026-07-01', consented_at = now()
        WHERE id = $1`,
      [child.id, keys.photo],
    );
    // a picture the child posted that is also the friend's photo (same bytes, same key)
    await pool.query(`UPDATE users SET profile_photo_key = $2 WHERE id = $1`, [friend.id, keys.shared]);
    await pool.query(
      `INSERT INTO image_posts (author_id, author_role, image_media_id) VALUES ($1, 'user', $2)`,
      [child.id, keys.shared],
    );

    const { lo, hi } = canonicalPair(child.id, friend.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, responded_at) VALUES ($1, $2, 'accepted', $1, now())`,
      [lo, hi],
    );
    const post = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, body, audio_media_id, status, published_at)
         VALUES ($1, 'user', 'gotin', 'Navê min Rojda ye', $2, 'published', now()) RETURNING id`,
        [child.id, keys.voice],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO library_comments (post_id, author_id, author_role, body) VALUES ($1, $2, 'user', 'Xweş e')`,
      [post, friend.id],
    );
    await pool.query(`INSERT INTO post_engagements (user_id, target_type, target_id, kind) VALUES ($1, 'library', $2, 'like')`, [
      friend.id,
      post,
    ]);
    const picture = (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption) VALUES ($1, 'user', $2, 'Ez') RETURNING id`,
        [child.id, keys.picture],
      )
    ).rows[0]!.id;
    const evidencePost = (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id) VALUES ($1, 'user', $2) RETURNING id`,
        [child.id, keys.evidence],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO image_scans (media_key, surface, action, model_version, preserve_evidence)
       VALUES ($1, 'feed', 'hard_block', 'test', true)`,
      [keys.evidence],
    );

    // the friend's post, with the child's voice comment and a reply under it
    const theirs = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, body, status, published_at, comment_count)
         VALUES ($1, 'user', 'gotin', 'Silav', 'published', now(), 2) RETURNING id`,
        [friend.id],
      )
    ).rows[0]!.id;
    const childComment = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_comments (post_id, author_id, author_role, body, audio_media_id, reply_count)
         VALUES ($1, $2, 'user', 'Ez 11 salî me', $3, 1) RETURNING id`,
        [theirs, child.id, keys.commentVoice],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO library_comments (post_id, author_id, author_role, parent_comment_id, depth, body)
       VALUES ($1, $2, 'user', $3, 1, 'Bi xêr hatî')`,
      [theirs, friend.id, childComment],
    );

    await pool.query(`INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, 'Dibistana min…')`, [
      lo,
      hi,
      child.id,
    ]);
    await pool.query(`INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, 'Silav!')`, [
      lo,
      hi,
      friend.id,
    ]);
    const group = (
      await pool.query<{ id: string }>(
        `INSERT INTO groups (name, privacy, owner_id) VALUES ($1, 'invite', $2) RETURNING id`,
        [`Child ${suffix} ${tag}`, child.id],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
      [group, child.id, friend.id],
    );
    await pool.query(`INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, 'Em li ku ne?')`, [
      group,
      child.id,
    ]);
    await pool.query(`INSERT INTO device_tokens (user_id, platform, token) VALUES ($1, 'ios', $2)`, [
      child.id,
      `tok-${tag}-${suffix}`,
    ]);
    await pool.query(`INSERT INTO notification_prefs (user_id) VALUES ($1)`, [child.id]);
    await pool.query(
      `INSERT INTO analytics_events (event_id, user_id, type, payload) VALUES ($1, $2, 'lesson_started', '{}'::jsonb)`,
      [`ev-${tag}-${suffix}`, child.id],
    );

    await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [child.id]);
    return { child, friend, keys, post, picture, evidencePost, theirs, childComment, group };
  };

  const count = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rowCount;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM groups WHERE name LIKE $1`, [`Child ${suffix}%`]);
      await client.query(`DELETE FROM image_scans WHERE media_key = ANY($1::text[])`, [evidence]);
      await client.query(`DELETE FROM media_uploads WHERE key = ANY($1::text[])`, [files]);
      await client.query(`DELETE FROM users WHERE email LIKE $1 OR id = ANY($2::uuid[])`, [
        `%_${suffix}@it.kurda.app`,
        closed,
      ]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('an answer under 13 removes what the child wrote, recorded and uploaded', async () => {
    const s = await seedChild('route');
    const res = await app.inject({
      method: 'POST',
      url: '/me/birth-date',
      payload: bornYearsAgo(11),
      headers: { authorization: `Bearer ${s.child.token}` },
      remoteAddress: ip(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().details).toEqual({ accountClosed: true });

    const id = [s.child.id];
    // the account itself: no name, address, photo, country, birth or consent
    const user = (
      await pool.query(
        `SELECT email, username, profile_photo_key, country, birth_year, consent_version, consented_at,
                analytics_consent, deleted_at FROM users WHERE id = $1`,
        id,
      )
    ).rows[0];
    expect(user).toMatchObject({
      profile_photo_key: null,
      country: null,
      birth_year: null,
      consent_version: null,
      consented_at: null,
      analytics_consent: false,
    });
    expect(user.deleted_at).not.toBeNull();
    expect(user.email).not.toContain(suffix);

    // their posts, pictures and the voice on them
    expect(await count(`SELECT 1 FROM library_posts WHERE author_id = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM image_posts WHERE author_id = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM post_engagements WHERE target_id = $1`, [s.post])).toBe(0);
    // their comment elsewhere is an empty tombstone, its voice gone, and the
    // reply under it is still there, as is the post it was on
    const comment = (await pool.query(`SELECT status, body, audio_media_id FROM library_comments WHERE id = $1`, [s.childComment]))
      .rows[0];
    expect(comment).toEqual({ status: 'removed', body: null, audio_media_id: null });
    expect(await count(`SELECT 1 FROM library_comments WHERE parent_comment_id = $1`, [s.childComment])).toBe(1);
    expect((await pool.query(`SELECT comment_count FROM library_posts WHERE id = $1`, [s.theirs])).rows[0].comment_count).toBe(1);

    // messages, on both sides, and their group handed to the friend in it
    expect(await count(`SELECT 1 FROM dm_messages WHERE user_lo = $1 OR user_hi = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM group_messages WHERE sender_id = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM group_members WHERE user_id = $1`, id)).toBe(0);
    expect((await pool.query(`SELECT owner_id FROM groups WHERE id = $1`, [s.group])).rows[0].owner_id).toBe(s.friend.id);

    // the people they knew, their phone, and what was recorded about them
    for (const table of ['device_tokens', 'notification_prefs', 'analytics_events', 'refresh_tokens']) {
      expect(await count(`SELECT 1 FROM ${table} WHERE user_id = $1`, id), table).toBe(0);
    }
    expect(await count(`SELECT 1 FROM friendships WHERE user_lo = $1 OR user_hi = $1`, id)).toBe(0);

    // with no storage configured here, their files wait for the orphan sweep:
    // unconfirmed and already old enough for it
    const files = await pool.query<{ key: string; due: boolean }>(
      `SELECT key, confirmed_at IS NULL AND created_at < now() - interval '1 day' AS due
         FROM media_uploads WHERE key = ANY($1::text[])`,
      [[s.keys.photo, s.keys.voice, s.keys.picture, s.keys.commentVoice]],
    );
    expect(files.rows.map((r) => r.due)).toEqual([true, true, true, true]);
    // but not a file somebody else uses, nor one held as evidence
    const kept = await pool.query<{ key: string }>(
      `SELECT key FROM media_uploads WHERE key = ANY($1::text[]) AND confirmed_at IS NOT NULL`,
      [[s.keys.shared, s.keys.evidence]],
    );
    expect(kept.rows.map((r) => r.key).sort()).toEqual([s.keys.shared, s.keys.evidence].sort());

    // and the session is over
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${s.child.token}` },
      remoteAddress: ip(),
    });
    expect(me.statusCode).toBe(401);
  });

  it('deletes the files from storage at once, leaving any it could not to the sweep', async () => {
    const s = await seedChild('store');
    const deleted: string[] = [];
    const storage = {
      delete: async (k: string) => {
        if (k === s.keys.voice) throw new Error('storage is down');
        deleted.push(k);
      },
    } as unknown as MediaStorage;

    await new GdprService(pool, { storage }).closeNow(s.child.id, 'under_minimum_age');

    expect(deleted.sort()).toEqual([s.keys.photo, s.keys.picture, s.keys.commentVoice].sort());
    // deleted ones leave no record behind; the one that failed is due for the sweep
    const left = await pool.query<{ key: string; confirmed: boolean }>(
      `SELECT key, confirmed_at IS NOT NULL AS confirmed FROM media_uploads WHERE key = ANY($1::text[])`,
      [Object.values(s.keys)],
    );
    expect(Object.fromEntries(left.rows.map((r) => [r.key, r.confirmed]))).toEqual({
      [s.keys.voice]: false,
      [s.keys.shared]: true,
      [s.keys.evidence]: true,
    });
  });
});
