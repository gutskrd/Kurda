/**
 * Closing an account found to be a child's removes the child's data, against
 * real Postgres.
 *
 * The client tells a child "your account has been closed and your personal
 * details removed", so this seeds an account with the things a child could
 * have put in it — a photo, a post with a voice recording and a picture, a
 * voice comment on somebody else's post, messages, a group, friends, story
 * games, a phone, analytics and consent — closes it the way the one-time birth month question
 * does, and checks that each of them is gone, while other people's posts,
 * replies and groups stay whole and files somebody else uses stay stored.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { canonicalPair } from '../friends/pair.js';
import { evidenceObjectKey } from '../moderation/pseudonym.js';
import { FakeStorage } from '../test/fake-storage.js';
import { GdprService } from './service.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';
import { giftCards } from '../gifts/cards.js';

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
  const storyIds: string[] = [];

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
    // a game invite each way, and a rematch offer
    await pool.query(
      `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, expires_at)
       VALUES ('wordle-battle', gen_random_uuid(), $1, $2, now() + interval '15 minutes'),
              ('rhyme-match', gen_random_uuid(), $2, $1, now() + interval '15 minutes')`,
      [child.id, friend.id],
    );
    await pool.query(`INSERT INTO play_rematches (game, lobby_id, user_id) VALUES ('wordle-battle', gen_random_uuid(), $1)`, [
      child.id,
    ]);
    await pool.query(
      `INSERT INTO analytics_events (event_id, user_id, type, payload) VALUES ($1, $2, 'lesson_started', '{}'::jsonb)`,
      [`ev-${tag}-${suffix}`, child.id],
    );

    // story games: one the child finished alone, a lobby the child hosts with
    // the friend in it, and the friend's running game the child is playing in
    const story = await insertStory(pool, { slug: `ce-${tag}-${suffix}` });
    storyIds.push(story.id);
    const game = async (mode: string, host: string, status: string) =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO story_games (mode, host_id, story_id, dialect, level, length, question_count, timer_seconds, status,
                                    finished_at)
           VALUES ($1, $2, $3, 'kurmanci', 1, 'short', 3, 0, $4, CASE WHEN $4 = 'finished' THEN now() END) RETURNING id`,
          [mode, host, story.id, status],
        )
      ).rows[0]!.id;
    const seat = (gameId: string, userId: string, n: number) =>
      pool.query(`INSERT INTO story_game_players (game_id, user_id, seat, last_seen_at) VALUES ($1, $2, $3, now())`, [
        gameId,
        userId,
        n,
      ]);
    const soloGame = await game('solo', child.id, 'finished');
    await seat(soloGame, child.id, 1);
    await pool.query(
      `INSERT INTO story_game_answers (game_id, user_id, question_index, choice, correct, elapsed_ms) VALUES ($1, $2, 0, 1, true, 900)`,
      [soloGame, child.id],
    );
    const childLobby = await game('group', child.id, 'lobby');
    await seat(childLobby, child.id, 1);
    await seat(childLobby, friend.id, 2);
    const friendsGame = await game('group', friend.id, 'reading');
    await seat(friendsGame, friend.id, 1);
    await seat(friendsGame, child.id, 2);

    await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [child.id]);
    return {
      child,
      friend,
      keys,
      post,
      picture,
      evidencePost,
      theirs,
      childComment,
      group,
      games: { soloGame, childLobby, friendsGame },
    };
  };

  const count = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rowCount;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await deleteStories(pool, storyIds);
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
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [`erase_gift_${suffix}`]);
    await pool.end();
    await app.close();
  });

  it('an answer under 13 removes what the child wrote, recorded and uploaded', async () => {
    const s = await seedChild('route');
    // the child leaves its games through the API's own story games, which wake
    // the other players' waiting polls (a separate service would not)
    const leaveAll = vi.spyOn(app.storyGames, 'leaveAll');
    const res = await app.inject({
      method: 'POST',
      url: '/me/birth-date',
      payload: bornYearsAgo(11),
      headers: { authorization: `Bearer ${s.child.token}` },
      remoteAddress: ip(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().details).toEqual({ accountClosed: true });
    expect(leaveAll).toHaveBeenCalledWith(s.child.id);
    leaveAll.mockRestore();

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
    // the games they asked others to and were asked to, and their rematch offers
    expect(await count(`SELECT 1 FROM play_invites WHERE host_id = $1 OR invitee_id = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM play_rematches WHERE user_id = $1`, id)).toBe(0);

    // their story games: answers and seats gone, their name off the games they
    // hosted; the lobby they hosted closed (through the leave path, first), and
    // the friend's game carries on without them
    expect(await count(`SELECT 1 FROM story_game_answers WHERE user_id = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM story_game_players WHERE user_id = $1`, id)).toBe(0);
    expect(await count(`SELECT 1 FROM story_games WHERE host_id = $1`, id)).toBe(0);
    const lobby = (await pool.query(`SELECT status, host_id FROM story_games WHERE id = $1`, [s.games.childLobby])).rows[0];
    expect(lobby).toEqual({ status: 'cancelled', host_id: null });
    const running = await pool.query(
      `SELECT g.status, array_agg(p.user_id) AS players FROM story_games g JOIN story_game_players p ON p.game_id = g.id
        WHERE g.id = $1 GROUP BY g.status`,
      [s.games.friendsGame],
    );
    expect(running.rows[0]).toEqual({ status: 'reading', players: [s.friend.id] });

    // with no storage configured here, their files wait for the orphan sweep:
    // unconfirmed and already old enough for it
    const files = await pool.query<{ key: string; due: boolean }>(
      `SELECT key, confirmed_at IS NULL AND created_at < now() - interval '1 day' AS due
         FROM media_uploads WHERE key = ANY($1::text[])`,
      [[s.keys.photo, s.keys.voice, s.keys.picture, s.keys.commentVoice]],
    );
    expect(files.rows.map((r) => r.due)).toEqual([true, true, true, true]);
    // but not a file somebody else uses
    const kept = await pool.query<{ key: string }>(
      `SELECT key FROM media_uploads WHERE key = ANY($1::text[]) AND confirmed_at IS NOT NULL`,
      [[s.keys.shared, s.keys.evidence]],
    );
    expect(kept.rows.map((r) => r.key)).toEqual([s.keys.shared]);
    // and one held as evidence is kept, but no longer served: on its way to
    // private storage, and out of the sweep's reach while the evidence is kept
    const held = await pool.query<{ preserve_evidence: boolean; quarantine_state: string | null }>(
      `SELECT preserve_evidence, quarantine_state FROM media_uploads WHERE key = $1`,
      [s.keys.evidence],
    );
    expect(held.rows[0]).toEqual({ preserve_evidence: true, quarantine_state: 'pending' });

    // and the session is over
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${s.child.token}` },
      remoteAddress: ip(),
    });
    expect(me.statusCode).toBe(401);
  });

  /**
   * A gift is a message in a chat, a line in the recipient's notifications,
   * and a present someone owns. The messages about the child go with the rest
   * of their messages, and the lines naming them as the giver from their
   * friends' notifications; the presents stay with whoever was given them, no
   * longer pointing back at the child.
   */
  it('takes the gift messages and notifications that were theirs, and leaves the presents', async () => {
    const child = await signUp('giftkid');
    const friend = await signUp('giftpal');
    const other = await signUp('giftother');
    closed.push(child.id);
    const sku = `erase_gift_${suffix}`;
    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock)
       VALUES ($1, 'Erase Test Gift', 'powerup', 'zer', 10, false, true, true)`,
      [sku],
    );
    const group = (
      await pool.query<{ id: string }>(
        `INSERT INTO groups (name, privacy, owner_id) VALUES ($1, 'invite', $2) RETURNING id`,
        [`Child ${suffix} gifts`, friend.id],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [group, friend.id, child.id, other.id],
    );

    /** One send, as the gift service stores it: a row per recipient and one message. */
    const send = async (from: Account, to: Account[], where: 'dm' | 'group'): Promise<string> => {
      const batch = (await pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`)).rows[0]!.id;
      for (const t of to) {
        await pool.query(
          `INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency, batch_id) VALUES ($1, $2, $3, 10, 'zer', $4)`,
          [from.id, t.id, sku, batch],
        );
      }
      if (where === 'group') {
        await pool.query(`INSERT INTO group_messages (group_id, sender_id, kind, gift_batch_id) VALUES ($1, $2, 'gift', $3)`, [
          group,
          from.id,
          batch,
        ]);
      } else {
        const { lo, hi } = canonicalPair(from.id, to[0]!.id);
        await pool.query(
          `INSERT INTO dm_messages (user_lo, user_hi, sender_id, kind, gift_batch_id) VALUES ($1, $2, $3, 'gift', $4)`,
          [lo, hi, from.id, batch],
        );
      }
      return batch;
    };
    const toChild = await send(friend, [child], 'dm');
    const fromChild = await send(child, [friend], 'dm');
    const childAlone = await send(friend, [child], 'group');
    const shared = await send(friend, [child, other], 'group');
    const childInGroup = await send(child, [other], 'group');
    const batches = [toChild, fromChild, childAlone, shared, childInGroup];

    // the line each recipient was sent in their notifications, as the gift
    // service writes it (and, without a batch or a chat, as the shop's gift
    // button wrote it before gifts were in the chat)
    const childName = (await pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [child.id])).rows[0]!
      .username;
    const notify = async (to: Account, from: Account, name: string, batch: string | null) => {
      const gift = (
        await pool.query<{ id: string }>(`SELECT id FROM gifts WHERE to_user_id = $1 AND batch_id = $2`, [to.id, batch ?? fromChild])
      ).rows[0]?.id;
      await pool.query(
        `INSERT INTO notifications (user_id, category, title, body, data) VALUES ($1, 'friends', 'You have a gift', $2, $3)`,
        [
          to.id,
          `${name} sent you Erase Test Gift.`,
          batch
            ? { kind: 'gift', giftId: gift, batchId: batch, chat: `dm:${from.id}`, sku, fromUserId: from.id }
            : { kind: 'gift', giftId: gift, sku, fromUserId: from.id },
        ],
      );
    };
    await notify(friend, child, childName, fromChild);
    await notify(other, child, childName, childInGroup);
    await notify(friend, child, childName, null);
    const friendName = (await pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [friend.id]))
      .rows[0]!.username;
    await notify(other, friend, friendName, shared);

    await new GdprService(pool).closeNow(child.id, 'under_minimum_age');

    // nobody's notifications keep the child's name or id: the ones about the
    // child's presents go, the one about the friend's stays
    expect(
      await count(`SELECT 1 FROM notifications WHERE user_id = ANY($1::uuid[]) AND data->>'fromUserId' = $2`, [
        [friend.id, other.id],
        child.id,
      ]),
    ).toBe(0);
    expect(await count(`SELECT 1 FROM notifications WHERE strpos(body, $1) > 0`, [childName])).toBe(0);
    expect(
      await count(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'batchId' = $2`, [other.id, shared]),
    ).toBe(1);

    // the messages: in the direct messages both ways, theirs in the group, and
    // the one in the group that was about them alone
    expect(await count(`SELECT 1 FROM dm_messages WHERE gift_batch_id = ANY($1::uuid[])`, [batches])).toBe(0);
    const left = await pool.query<{ gift_batch_id: string }>(
      `SELECT gift_batch_id FROM group_messages WHERE group_id = $1`,
      [group],
    );
    expect(left.rows.map((r) => r.gift_batch_id)).toEqual([shared]);

    // the presents: every one still there, the child's no longer naming them as the giver
    expect(await count(`SELECT 1 FROM gifts WHERE batch_id = ANY($1::uuid[])`, [batches])).toBe(6);
    const fromRows = await pool.query<{ from_user_id: string | null }>(
      `SELECT from_user_id FROM gifts WHERE batch_id = ANY($1::uuid[])`,
      [[fromChild, childInGroup]],
    );
    expect(fromRows.rows).toEqual([{ from_user_id: null }, { from_user_id: null }]);

    // and the gift that stays lists only the friend still here
    const card = (await giftCards(pool, [shared], { id: other.id, seesEveryone: true })).get(shared)!;
    expect(card.recipients).toEqual([expect.objectContaining({ name: expect.stringContaining('ce_giftother'), isMe: true })]);
  });

  it('deletes the files from storage at once, leaving any it could not to the sweep', async () => {
    const s = await seedChild('store');
    const fake = new FakeStorage();
    for (const k of Object.values(s.keys)) fake.upload(k);
    const remove = fake.delete.bind(fake);
    fake.delete = async (k: string) => {
      if (k === s.keys.voice) throw new Error('storage is down');
      await remove(k);
    };

    await new GdprService(pool, { storage: fake.asStorage }).closeNow(s.child.id, 'under_minimum_age');

    // what is still public: the file that failed, and the one somebody else uses —
    // the evidence went to private storage instead of being deleted
    expect([...fake.publicObjects.keys()].sort()).toEqual([s.keys.voice, s.keys.shared].sort());
    expect(fake.evidence.has(evidenceObjectKey(s.keys.evidence))).toBe(true);
    // deleted ones leave no record behind; the one that failed is due for the sweep
    const left = await pool.query<{ key: string; confirmed: boolean }>(
      `SELECT key, confirmed_at IS NOT NULL AS confirmed FROM media_uploads WHERE key = ANY($1::text[])`,
      [Object.values(s.keys)],
    );
    expect(Object.fromEntries(left.rows.map((r) => [r.key, r.confirmed]))).toEqual({
      [s.keys.voice]: false,
      [s.keys.shared]: true,
      [s.keys.evidence]: false,
    });
    const held = await pool.query<{ preserve_evidence: boolean; quarantine_state: string | null }>(
      `SELECT preserve_evidence, quarantine_state FROM media_uploads WHERE key = $1`,
      [s.keys.evidence],
    );
    expect(held.rows[0]).toEqual({ preserve_evidence: true, quarantine_state: 'done' });
  });
});
