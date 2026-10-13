/**
 * Enforcement (M3) against real Postgres: a ban is checked at sign-in and on
 * refresh and answered with the reasons and an appeal-only token; mutes stop
 * every way text or media is created, and lift again.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { AccountStanding, AppealView, MutedErrorDetails, SuspendedErrorDetails } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { FriendService } from '../friends/service.js';
import { GroupService } from '../groups/service.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { OFFENSE_PERM } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('moderation enforcement (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'me', 143);
  const { call } = kit;
  let modA: Person, modB: Person, banned: Person, muted: Person, friend: Person;
  let groupId = '';
  let postId = '';
  const ids: string[] = [];

  const dm = (from: Person, to: Person, body = 'hello') => call('POST', `/chat/${to.id}/messages`, from.token, { body });
  const groupMsg = (from: Person, body = 'hello all') => call('POST', `/groups/${groupId}/chat`, from.token, { body });
  const post = (from: Person) => call('POST', '/library/posts', from.token, { type: 'gotin', body: 'Gotinek.' });
  const comment = (from: Person) => call('POST', `/library/posts/${postId}/comments`, from.token, { body: 'a comment' });

  beforeAll(async () => {
    app = buildApp(config, { moderation: { moderatorCount: async () => 2, mailer: { send: async () => undefined } } });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    modA = await kit.admin('moda', ['moderator']);
    modB = await kit.admin('modb', ['moderator']);
    banned = await kit.person('banned');
    muted = await kit.person('muted');
    friend = await kit.person('friend');
    ids.push(modA.id, modB.id, banned.id, muted.id, friend.id);
    const friends = new FriendService(pool);
    await friends.request(muted.id, friend.id);
    await friends.respond(friend.id, muted.id, true);
    const groups = new GroupService(pool);
    groupId = (await groups.create(friend.id, { name: `Kom ${kit.suffix}`, privacy: 'open' })).id;
    await groups.join(muted.id, groupId);
    postId = ((await post(friend)).json() as { id: string }).id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await pool.end();
    await app.close();
  });

  describe('a suspended or banned account', () => {
    let appealToken = '';

    it('cannot sign in: it is told why, until when, and gets a token that can only appeal', async () => {
      const applied = await call('POST', `/admin/users/${banned.id}/sanctions`, modA.token, {
        kind: 'suspension', durationHours: 168, policy: 'harassment', statement: 'You kept messaging people who asked you to stop.',
      });
      expect(applied.statusCode).toBe(201);

      // the ban ended the old session at once
      expect((await call('GET', '/me', banned.token)).statusCode).toBe(401);

      const login = await kit.login(banned);
      expect(login.statusCode).toBe(403);
      expect(login.json().code).toBe('ACCOUNT_SUSPENDED');
      const details = login.json().details as SuspendedErrorDetails;
      expect(details).toMatchObject({ policy: 'harassment', statement: 'You kept messaging people who asked you to stop.', appealable: true });
      expect(Date.parse(details.until!) - Date.now()).toBeGreaterThan(167 * 3_600_000);
      expect(login.json().tokens).toBeUndefined();
      appealToken = details.appealToken;
    });

    it('cannot refresh either: the phone lands on the suspension screen, not the sign-in form', async () => {
      // the ban revoked the token the phone holds; its next refresh is told why
      const res = await call('POST', '/auth/refresh', null, { refreshToken: banned.refreshToken });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('ACCOUNT_SUSPENDED');
      expect((res.json().details as SuspendedErrorDetails).appealToken).toEqual(expect.any(String));
      expect(res.json().tokens).toBeUndefined();

      // and a token a ban written straight to the account left live is revoked on the spot
      await pool.query(`UPDATE refresh_tokens SET revoked_at = NULL WHERE user_id = $1`, [banned.id]);
      expect((await call('POST', '/auth/refresh', null, { refreshToken: banned.refreshToken })).statusCode).toBe(403);
      const live = await pool.query(`SELECT 1 FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, [banned.id]);
      expect(live.rowCount).toBe(0);
    });

    it('reads its standing and files an appeal with the appeal token — and nothing else', async () => {
      const standing = await call('GET', '/me/standing', appealToken);
      expect(standing.statusCode).toBe(200);
      const s = standing.json() as AccountStanding;
      expect(s.status).toBe('suspended');
      expect(s.active[0]).toMatchObject({ kind: 'suspension', policy: 'harassment', appeal: { allowed: true } });

      const filed = await call('POST', '/me/appeals', appealToken, { sanctionId: s.active[0]!.id, text: 'I only replied once.' });
      expect(filed.statusCode).toBe(201);
      expect((filed.json() as AppealView).status).toBe('open');

      // the token reaches nothing else
      expect((await call('GET', '/me', appealToken)).statusCode).toBe(401);
      expect((await call('GET', '/me/reports', appealToken)).statusCode).toBe(401);
      expect((await call('POST', '/reports', appealToken, { targetType: 'user', targetId: modA.id, category: 'spam' })).statusCode).toBe(401);
      // and without any token there is no standing to read
      expect((await call('GET', '/me/standing')).statusCode).toBe(401);
    });

    it('signs in again once the appeal overturns the suspension', async () => {
      const appeal = (await pool.query<{ id: string }>(`SELECT id FROM appeals WHERE user_id = $1`, [banned.id])).rows[0]!;
      const res = await call('POST', `/admin/appeals/${appeal.id}/decide`, modB.token, { outcome: 'overturned', note: 'One reply is not harassment.' });
      expect(res.statusCode).toBe(200);
      expect((await kit.login(banned)).statusCode).toBe(200);
      // the appeal token can still read the standing until it expires — it never could do more
      const after = (await call('GET', '/me/standing', appealToken)).json() as AccountStanding;
      expect(after.status).toBe('good');
    });

    it('a ban written straight to the account still keeps it out, with a generic reason', async () => {
      await pool.query(`UPDATE users SET banned_at = now(), banned_until = NULL WHERE id = $1`, [banned.id]);
      const login = await kit.login(banned);
      expect(login.statusCode).toBe(403);
      expect(login.json().details).toMatchObject({ until: null, policy: null, appealable: false });
      await pool.query(`UPDATE users SET banned_at = NULL WHERE id = $1`, [banned.id]);
      expect((await kit.login(banned)).statusCode).toBe(200);
    });
  });

  describe('a muted account', () => {
    it('can message and post before', async () => {
      expect((await dm(muted, friend)).statusCode).toBe(200);
      expect((await groupMsg(muted)).statusCode).toBe(200);
      expect((await comment(muted)).statusCode).toBe(201);
    });

    it('cannot send direct or group messages under a chat mute, and is told until when', async () => {
      const res = await call('POST', `/admin/users/${muted.id}/sanctions`, modA.token, {
        kind: 'chat_mute', durationHours: 24, policy: 'harassment', statement: 'Insults in group chat.',
      });
      expect(res.statusCode).toBe(201);
      const blocked = await dm(muted, friend);
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().code).toBe('MUTED');
      const details = blocked.json().details as MutedErrorDetails;
      expect(details.scope).toBe('chat');
      expect(Date.parse(details.until!) - Date.now()).toBeGreaterThan(23 * 3_600_000);
      expect((await groupMsg(muted)).json().code).toBe('MUTED');
      // posting is a different matter
      expect((await comment(muted)).statusCode).toBe(201);
      // and the enforced column says so too
      const col = await pool.query<{ muted_until: Date | null }>(`SELECT muted_until FROM users WHERE id = $1`, [muted.id]);
      expect(col.rows[0]!.muted_until).not.toBeNull();
    });

    it('cannot post or comment under a post mute', async () => {
      await call('POST', `/admin/users/${muted.id}/sanctions`, modA.token, {
        kind: 'post_mute', durationHours: 72, policy: 'spam', statement: 'Copy-pasted comments.',
      });
      for (const res of [await post(muted), await comment(muted)]) {
        expect(res.statusCode).toBe(403);
        expect(res.json().details.scope).toBe('post');
      }
      const edit = await call('PATCH', `/library/posts/${postId}`, muted.token, { body: 'x' });
      expect(edit.statusCode).toBe(403);
      // nor publish words some other way: a profile's name and bio, a new group
      for (const change of [{ bio: 'insults' }, { displayName: 'insults' }, { username: `insult${kit.suffix}`.slice(0, 30) }]) {
        const res = await call('PATCH', '/me', muted.token, change);
        expect(res.statusCode).toBe(403);
        expect(res.json().details.scope).toBe('post');
      }
      const group = await call('POST', '/groups', muted.token, { name: 'Insults', description: 'insults' });
      expect(group.statusCode).toBe(403);
      expect(group.json().details.scope).toBe('post');
      // settings that publish nothing still change
      expect((await call('PATCH', '/me', muted.token, { skipSpeaking: true })).statusCode).toBe(200);
    });

    it('cannot upload voice or pictures under a feature limit', async () => {
      await call('POST', `/admin/users/${muted.id}/sanctions`, modA.token, {
        kind: 'feature_limit', durationHours: 24, policy: 'sexual', statement: 'An explicit picture.',
      });
      const res = await call('POST', '/media/voice', muted.token);
      expect(res.statusCode).toBe(403);
      expect(res.json().details.scope).toBe('media');
      // a profile picture is a picture too
      const photo = await call('POST', '/me/profile-picture', muted.token);
      expect(photo.statusCode).toBe(403);
      expect(photo.json()).toMatchObject({ code: 'MUTED', details: { scope: 'media' } });
      // nor through the speaking-practice upload
      const practice = await call('POST', '/media/uploads', muted.token);
      expect(practice.statusCode).toBe(403);
      expect(practice.json().details.scope).toBe('media');
    });

    it('cannot publish voice uploaded before (or elsewhere) under a feature limit', async () => {
      const limited = await kit.person('limited');
      ids.push(limited.id);
      const key = `voice-note/limited_${kit.suffix}.webm`;
      await pool.query(
        `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at) VALUES ($1, 'audio/webm', 10, now())`,
        [key],
      );
      // fine before the limit
      const before = await call('POST', `/library/posts/${postId}/comments`, limited.token, { audioMediaId: key });
      expect(before.statusCode).toBe(201);
      await call('POST', `/admin/users/${limited.id}/sanctions`, modA.token, {
        kind: 'feature_limit', durationHours: 24, policy: 'sexual', statement: 'An explicit recording.',
      });
      const asComment = await call('POST', `/library/posts/${postId}/comments`, limited.token, { audioMediaId: key });
      expect(asComment.statusCode).toBe(403);
      expect(asComment.json().details.scope).toBe('media');
      const asPost = await call('POST', '/library/posts', limited.token, { type: 'gotin', body: 'Gotin.', audioMediaId: key });
      expect(asPost.json()).toMatchObject({ code: 'MUTED', details: { scope: 'media' } });
      const edited = await call('PATCH', `/library/comments/${(before.json() as { id: string }).id}`, limited.token, { audioMediaId: key });
      expect(edited.json()).toMatchObject({ code: 'MUTED', details: { scope: 'media' } });
      // text alone is still theirs to post
      expect((await call('POST', `/library/posts/${postId}/comments`, limited.token, { body: 'words only' })).statusCode).toBe(201);
    });

    it('cannot attach a voice file moderation took down', async () => {
      const key = `voice-note/blocked_${kit.suffix}.webm`;
      await pool.query(
        `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status) VALUES ($1, 'audio/webm', 10, now(), 'blocked')`,
        [key],
      );
      const res = await call('POST', `/library/posts/${postId}/comments`, friend.token, { audioMediaId: key });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('INVALID_AUDIO');
      const edit = await call('PATCH', `/library/posts/${postId}`, friend.token, { audioMediaId: key });
      expect(edit.json().code).toBe('INVALID_AUDIO');
    });

    it('sees all of it on the standing page', async () => {
      const s = (await call('GET', '/me/standing', muted.token)).json() as AccountStanding;
      expect(s.status).toBe('limited');
      expect(Object.keys(s.restrictions).sort()).toEqual(['chat', 'media', 'post']);
    });

    it('is free again after an unmute', async () => {
      const res = await call('POST', `/admin/users/${muted.id}/unmute`, modB.token, { reason: 'served enough' });
      expect(res.json()).toEqual({ lifted: 3 });
      expect((await dm(muted, friend)).statusCode).toBe(200);
      expect((await comment(muted)).statusCode).toBe(201);
      const lifted = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'sanction_lifted'`, [muted.id]);
      expect(lifted.rowCount).toBe(3);
    });

    it('honours a mute written straight to users.muted_until', async () => {
      await pool.query(`UPDATE users SET muted_until = now() + interval '1 hour' WHERE id = $1`, [muted.id]);
      expect((await dm(muted, friend)).json().code).toBe('MUTED');
      await pool.query(`UPDATE users SET muted_until = NULL WHERE id = $1`, [muted.id]);
      expect((await dm(muted, friend)).statusCode).toBe(200);
    });

    it('a permanent automatic chat mute can be lifted by an admin', async () => {
      await pool.query(
        `INSERT INTO chat_offenses (user_id, offense_count, perm_muted) VALUES ($1, $2, true)
         ON CONFLICT (user_id) DO UPDATE SET offense_count = EXCLUDED.offense_count, perm_muted = true`,
        [muted.id, OFFENSE_PERM],
      );
      expect((await dm(muted, friend)).json().code).toBe('CHAT_MUTED');
      const page = (await call('GET', `/admin/users/${muted.id}`, modA.token)).json() as { chatOffenses: { permanent: boolean } };
      expect(page.chatOffenses.permanent).toBe(true);
      expect((await call('POST', `/admin/users/${muted.id}/chat-mute/lift`, modA.token, { reason: 'a misunderstanding' })).json()).toEqual({ lifted: true });
      expect((await dm(muted, friend)).statusCode).toBe(200);
    });

    it('a permanent chat mute has no end, and says so', async () => {
      await call('POST', `/admin/users/${muted.id}/sanctions`, modA.token, {
        kind: 'chat_mute', durationHours: null, policy: 'hate', statement: 'Repeated slurs.',
      });
      const blocked = await dm(muted, friend);
      expect(blocked.json().details).toEqual({ until: null, scope: 'chat' });
      const page = (await call('GET', `/admin/users/${muted.id}`, modA.token)).json() as { mutedUntil: string | null; mutedPermanently: boolean };
      expect(page).toMatchObject({ mutedUntil: null, mutedPermanently: true });
      await call('POST', `/admin/users/${muted.id}/unmute`, modA.token, { reason: 'lifted' });
      expect((await dm(muted, friend)).statusCode).toBe(200);
    });
  });
});
