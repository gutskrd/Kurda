/** GDPR deletion + export flows (CI integration job; export needs MinIO). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createStorage } from '../media/storage.js';
import { GdprService, DELETION_GRACE_DAYS } from './service.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;
const S3_READY = Boolean(process.env.S3_ENDPOINT);

describe.skipIf(!DATABASE_URL)('GDPR (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  async function makeUser(name: string, birth: { birthYear: number; birthMonth: number } = { birthYear: 1990, birthMonth: 6 }) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...birth,
      },
      remoteAddress: `10.13.0.${Math.floor(Math.random() * 200) + 1}`,
    });
    await activate(app, pool, res);
    return {
      id: res.json().user.id as string,
      token: res.json().tokens.accessToken as string,
      email: `${name}_${suffix}@it.kurda.app`,
    };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM support_emails WHERE provider_id LIKE $1`, [`gdpr-${suffix}-%`]);
    await pool.query(
      `DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app' OR email LIKE 'deleted_%@deleted.kurda.app'`,
    );
    await pool.end();
    await app.close();
  });

  it('DELETE /me starts the grace period; login cancels it', async () => {
    const user = await makeUser('grace');
    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${user.token}` },
      remoteAddress: '10.13.1.1',
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().graceDays).toBe(DELETION_GRACE_DAYS);

    const marked = await pool.query(`SELECT deletion_requested_at FROM users WHERE id = $1`, [user.id]);
    expect(marked.rows[0].deletion_requested_at).not.toBeNull();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'a-strong-password1' },
      remoteAddress: '10.13.1.2',
    });
    expect(login.statusCode).toBe(200);
    const cancelled = await pool.query(`SELECT deletion_requested_at FROM users WHERE id = $1`, [user.id]);
    expect(cancelled.rows[0].deletion_requested_at).toBeNull();
  });

  it('deletion scrubs PII after the grace period but keeps the row', async () => {
    const user = await makeUser('anon');
    await pool.query(
      `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
      [user.id],
    );
    const service = new GdprService(pool);
    const count = await service.anonymizeExpired();
    expect(count).toBeGreaterThanOrEqual(1);

    const row = await pool.query(
      `SELECT email, username, display_name, password_hash, deleted_at FROM users WHERE id = $1`,
      [user.id],
    );
    expect(row.rowCount).toBe(1); // row kept for aggregates
    expect(row.rows[0].email).toContain('@deleted.kurda.app');
    expect(row.rows[0].username).toContain('deleted_');
    expect(row.rows[0].password_hash).toBeNull();
    expect(row.rows[0].deleted_at).not.toBeNull();

    // sessions dead, old token rejected
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${user.token}` },
      remoteAddress: '10.13.1.3',
    });
    expect([401, 403]).toContain(me.statusCode);

    // rerun is idempotent for this user
    const again = await service.anonymizeExpired();
    expect(again).toBe(0);
  });

  it('a minor’s deletion removes what they posted, so nothing friends-only becomes public', async () => {
    const teen = await makeUser('delteen', bornYearsAgo(15));
    const post = await app.inject({
      method: 'POST',
      url: '/library/posts',
      headers: { authorization: `Bearer ${teen.token}` },
      payload: { type: 'gotin', body: 'Silav hevalno' },
      remoteAddress: '10.13.1.20',
    });
    expect(post.statusCode, post.body).toBe(201);
    const postId = post.json().id as string;
    // a stranger cannot read it while its author is a minor
    expect((await app.inject({ method: 'GET', url: `/library/posts/${postId}`, remoteAddress: '10.13.1.21' })).statusCode).toBe(404);

    await pool.query(
      `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
      [teen.id],
    );
    await new GdprService(pool).anonymizeExpired();

    // the account is anonymized, and the post is gone rather than public
    const row = await pool.query(`SELECT deleted_at, birth_year FROM users WHERE id = $1`, [teen.id]);
    expect(row.rows[0].deleted_at).not.toBeNull();
    expect(row.rows[0].birth_year).toBeNull();
    expect((await pool.query(`SELECT 1 FROM library_posts WHERE id = $1`, [postId])).rowCount).toBe(0);
    expect((await app.inject({ method: 'GET', url: `/library/posts/${postId}`, remoteAddress: '10.13.1.22' })).statusCode).toBe(404);
  });

  /** Mail to the support address, as the Resend webhook keeps it (email/support-inbox.ts). */
  async function supportMail(from: string, subject: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO support_emails (provider_id, from_address, from_name, to_addresses, subject, text_body, received_at)
       VALUES ($1, $2, 'Someone', '{support@hevalo.app}', $3, 'my password reset never came', now())
       RETURNING id`,
      [`gdpr-${suffix}-${subject}`, from.toLowerCase(), subject],
    );
    const id = rows[0]!.id;
    await pool.query(`INSERT INTO support_email_replies (email_id, body) VALUES ($1, 'we sent it again')`, [id]);
    return id;
  }

  it('the export carries what they wrote to support, and the answers', async () => {
    const user = await makeUser('exportsupport');
    // the inbox keeps addresses in lower case; the account's may be mixed
    await pool.query(`UPDATE users SET email = $2 WHERE id = $1`, [user.id, user.email.replace('exportsupport', 'ExportSupport')]);
    await supportMail(user.email, 'help-export');
    await supportMail(`someone-else-${suffix}@it.kurda.app`, 'not-theirs');

    const doc = await new GdprService(pool).buildExport(user.id);
    const mail = doc.supportEmails as Array<{ subject: string; text_body: string; answers: Array<{ body: string }> }>;
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ subject: 'help-export', text_body: 'my password reset never came' });
    expect(mail[0]!.answers.map((a) => a.body)).toEqual(['we sent it again']);
  });

  it('anonymizing an account removes its mail to support, which names its address', async () => {
    const user = await makeUser('anonsupport');
    const theirs = await supportMail(user.email, 'help-anon');
    const other = await supportMail(`bystander-${suffix}@it.kurda.app`, 'bystander');
    await pool.query(
      `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
      [user.id],
    );
    await new GdprService(pool).anonymizeExpired();

    expect((await pool.query(`SELECT 1 FROM support_emails WHERE id = $1`, [theirs])).rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM support_email_replies WHERE email_id = $1`, [theirs])).rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM support_emails WHERE from_address = $1`, [user.email])).rowCount).toBe(0);
    // somebody else's mail stays
    expect((await pool.query(`SELECT 1 FROM support_emails WHERE id = $1`, [other])).rowCount).toBe(1);
    await pool.query(`DELETE FROM support_emails WHERE id = $1`, [other]);
  });

  it('the export carries the birth month and year it was given', async () => {
    const user = await makeUser('exportage');
    await pool.query(`UPDATE users SET birth_year = 1990, birth_month = 4 WHERE id = $1`, [user.id]);
    const doc = await new GdprService(pool).buildExport(user.id);
    expect(doc.user).toMatchObject({ birth_year: 1990, birth_month: 4 });
  });

  /*
   * What the app says when somebody deletes their account — "your account and
   * all your data will be permanently deleted" — is what happens, whatever
   * their age: what they posted goes, not just their name from it.
   */
  it('an adult’s deletion removes what they posted, as the app says it will', async () => {
    const adult = await makeUser('deladult');
    const post = await app.inject({
      method: 'POST',
      url: '/library/posts',
      headers: { authorization: `Bearer ${adult.token}` },
      payload: { type: 'gotin', body: 'Silav hevalno' },
      remoteAddress: '10.13.1.23',
    });
    expect(post.statusCode, post.body).toBe(201);
    const postId = post.json().id as string;

    await pool.query(
      `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
      [adult.id],
    );
    await new GdprService(pool).anonymizeExpired();

    const row = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [adult.id]);
    expect(row.rows[0].deleted_at).not.toBeNull();
    expect((await pool.query(`SELECT 1 FROM library_posts WHERE id = $1`, [postId])).rowCount).toBe(0);
    expect((await app.inject({ method: 'GET', url: `/library/posts/${postId}`, remoteAddress: '10.13.1.24' })).statusCode).toBe(404);
  });

  it('a deletion leaves their unfinished story games, and takes their seat out of the finished ones', async () => {
    const user = await makeUser('anongames');
    const story = await insertStory(pool, { slug: `gdpr-anon-${Date.now().toString(36)}` });
    try {
      const game = async (status: string) =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO story_games (mode, host_id, story_id, dialect, level, length, question_count, timer_seconds, status,
                                      finished_at)
             VALUES ('group', $1, $2, 'kurmanci', 1, 'short', 3, 60, $3, CASE WHEN $3 = 'finished' THEN now() END) RETURNING id`,
            [user.id, story.id, status],
          )
        ).rows[0]!.id;
      const finished = await game('finished');
      const lobby = await game('lobby');
      for (const id of [finished, lobby]) {
        await pool.query(`INSERT INTO story_game_players (game_id, user_id, seat, score) VALUES ($1, $2, 1, 200)`, [id, user.id]);
      }
      await pool.query(
        `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
        [user.id],
      );
      await new GdprService(pool).anonymizeExpired();
      expect((await pool.query(`SELECT status FROM story_games WHERE id = $1`, [lobby])).rows[0].status).toBe('cancelled');
      // the game stays for whoever else played it, with no host and no seat of theirs
      expect((await pool.query(`SELECT host_id FROM story_games WHERE id = $1`, [finished])).rows).toEqual([{ host_id: null }]);
      const seat = await pool.query(`SELECT 1 FROM story_game_players WHERE game_id = $1 AND user_id = $2`, [finished, user.id]);
      expect(seat.rowCount).toBe(0);
    } finally {
      await deleteStories(pool, [story.id]);
    }
  });

  it('the export lists their story games as they played them, and nothing about the other players', async () => {
    const user = await makeUser('exportgames');
    const other = await makeUser('exportother');
    const story = await insertStory(pool, { slug: `gdpr-export-${Date.now().toString(36)}` });
    try {
      const game = await pool.query<{ id: string }>(
        `INSERT INTO story_games (mode, host_id, story_id, dialect, level, length, question_count, timer_seconds, status, finished_at)
         VALUES ('duo', $1, $2, 'kurmanci', 1, 'short', 3, 60, 'finished', now()) RETURNING id`,
        [other.id, story.id],
      );
      await pool.query(
        `INSERT INTO story_game_players (game_id, user_id, seat, score, correct, answered, xp_awarded)
         VALUES ($1, $2, 1, 300, 3, 3, 20), ($1, $3, 2, 200, 2, 3, 15)`,
        [game.rows[0]!.id, other.id, user.id],
      );
      const doc = await new GdprService(pool).buildExport(user.id);
      expect(doc.storyGames).toEqual([
        expect.objectContaining({ mode: 'duo', story_title: story.title, status: 'finished', score: 200, correct: 2, answered: 3 }),
      ]);
      expect(JSON.stringify(doc.storyGames)).not.toContain(other.id);
    } finally {
      await deleteStories(pool, [story.id]);
    }
  });

  it('the export carries their Game Ranks: ratings, every change with its reason, seasons', async () => {
    const user = await makeUser('exportranks');
    await pool.query(
      `INSERT INTO game_ratings (user_id, game, mu, sigma, points, rated_games, season_id) VALUES ($1, 'stories', 27, 5, 480, 3, '2026-Q4')`,
      [user.id],
    );
    const doc = await new GdprService(pool).buildExport(user.id);
    expect(doc.gameRanks).toMatchObject({
      ratings: [expect.objectContaining({ game: 'stories', points: 480, rated_games: 3 })],
      history: [],
      seasons: [],
    });
  });

  it.skipIf(!S3_READY)('export request → fulfillment → signed download', async () => {
    const user = await makeUser('export');
    // loadConfig() from process.env so the CI job's S3_* vars are seen
    const fullConfig = loadConfig();
    // test files run in arbitrary order — ensure the bucket exists
    const s3 = new S3Client({
      region: fullConfig.S3_REGION,
      endpoint: fullConfig.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: fullConfig.S3_ACCESS_KEY_ID as string,
        secretAccessKey: fullConfig.S3_SECRET_ACCESS_KEY as string,
      },
    });
    await s3.send(new CreateBucketCommand({ Bucket: fullConfig.S3_BUCKET })).catch(() => undefined);
    const storage = createStorage(fullConfig);
    const service = new GdprService(pool, { storage });

    const exportId = await service.requestExport(user.id);
    // duplicate request within 24h returns the same export
    expect(await service.requestExport(user.id)).toBe(exportId);

    await service.fulfillExport(exportId);
    await service.fulfillExport(exportId); // idempotent

    const status = await service.exportStatus(user.id);
    expect(status.status).toBe('ready');
    expect(status.downloadUrl).toBeDefined();

    const download = await fetch(status.downloadUrl as string);
    expect(download.status).toBe(200);
    const doc = (await download.json()) as { user: { email: string }; format: string };
    expect(doc.format).toBe('kurda-user-export/v1');
    expect(doc.user.email).toBe(user.email);
    expect(JSON.stringify(doc)).not.toContain('password');
  });

  it('export without storage returns 503 via the route', async () => {
    const user = await makeUser('nostore');
    const res = await app.inject({
      method: 'POST',
      url: '/me/export',
      headers: { authorization: `Bearer ${user.token}` },
      remoteAddress: '10.13.1.4',
    });
    // app built without S3 config in this test file → EXPORT_NOT_AVAILABLE
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('EXPORT_NOT_AVAILABLE');
  });
});
