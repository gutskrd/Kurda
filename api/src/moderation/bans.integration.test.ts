/**
 * The one ban flow against real Postgres, through the API: what a ban does to the person's content (kept, hidden,
 * removed) and how it comes back; that a banned account is unavailable everywhere; the emailed statement of reasons;
 * the registry and possible returns (refused, held, flagged, decided); the GDPR rights a banned person keeps; and the
 * superadmin's trusted networks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { MODERATED_MESSAGE_BODY } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { canonicalPair } from '../friends/pair.js';
import { RiskService } from '../risk/service.js';
import { networkHashOf } from '../net/network-key.js';
import { memoryStorage, seedPictureUpload } from '../test/media.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { befriend } from '../test/social.js';
import { closeReturnsOf, returnsToClose } from './returns.js';
import { SanctionsService } from './sanctions-service.js';
import { purgeDue, settleTakedowns, takedownsToSettle } from './takedown.js';
import { inTransaction } from './tx.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('bans that hold (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const storage = memoryStorage();
  const kit = moderationKit(() => app, () => pool, 'bn', 163);
  const { call } = kit;
  const emails: Array<{ to: string; template: string; vars: Record<string, string>; locale: string }> = [];
  const pings: string[] = [];
  let mod: Person;
  let root: Person;
  const created: string[] = [];

  const person = async (tag: string): Promise<Person> => {
    const p = await kit.person(tag);
    created.push(p.id);
    return p;
  };
  const ban = (who: Person, body: Record<string, unknown>) =>
    call('POST', `/admin/users/${who.id}/sanctions`, mod.token, { policy: 'harassment', statement: 'You kept sending hurtful messages.', ...body });
  const settle = async () => {
    for (const userId of await takedownsToSettle(pool)) await inTransaction(pool, (c) => settleTakedowns(c, userId));
  };
  const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T> => (await pool.query<T>(sql, params)).rows[0]!;

  beforeAll(async () => {
    app = buildApp(config, {
      moderation: {
        moderatorCount: async () => 1,
        mailer: { send: async () => undefined },
        banEmails: async (to, template, vars, locale) => {
          emails.push({ to, template, vars, locale });
        },
        accountChanged: async (userId) => {
          pings.push(userId);
        },
      },
    });
    app.decorate('storage', storage);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    mod = await kit.admin('mod', ['moderator']);
    root = await kit.admin('root', ['superadmin']);
    created.push(mod.id, root.id);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM possible_returns WHERE user_id = ANY($1) OR banned_user_id = ANY($1)`, [created]);
    await pool.query(`DELETE FROM groups WHERE owner_id = ANY($1)`, [created]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created]);
    await app.close();
    await pool.end();
  });

  it('Hide takes everything public down at once, and lifting the ban puts back exactly that', async () => {
    const rojda = await person('hide');
    const friend = await person('hidefriend');
    await befriend(pool, rojda.id, friend.id);
    await pool.query(`UPDATE users SET bio = 'Ez ji Amedê me', display_name = 'Rojda', country = 'TR' WHERE id = $1`, [rojda.id]);
    const post = await one<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at) VALUES ($1, 'user', 'poem', 'Helbest', 'Rûpel', 'published', now()) RETURNING id`,
      [rojda.id],
    );
    const theirs = await one<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at, comment_count) VALUES ($1, 'user', 'story', 'Çîrok', 'Hebû tunebû', 'published', now(), 1) RETURNING id`,
      [friend.id],
    );
    const comment = await one<{ id: string }>(
      `INSERT INTO library_comments (post_id, author_id, author_role, body, status) VALUES ($1, $2, 'user', 'Pir xweş', 'visible') RETURNING id`,
      [theirs.id, rojda.id],
    );
    const { lo, hi } = canonicalPair(rojda.id, friend.id);
    const dm = await one<{ id: string }>(`INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, 'silav') RETURNING id`, [lo, hi, rojda.id]);
    const group = await one<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ('Koma me', $1) RETURNING id`, [rojda.id]);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`, [group.id, rojda.id, friend.id]);

    const summary = await call('GET', `/admin/users/${rojda.id}/content-summary`, mod.token);
    expect(summary.json().summary).toMatchObject({ posts: 1, comments: 1, directMessages: 1, profile: true });

    const res = await ban(rojda, { kind: 'suspension', durationHours: 48, content: { choice: 'hide', includeMessages: true } });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().takedown).toMatchObject({ posts: 1, comments: 1, directMessages: 1, profile: true });

    expect((await one<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [post.id])).status).toBe('removed');
    expect(await one(`SELECT status, body FROM library_comments WHERE id = $1`, [comment.id])).toEqual({ status: 'removed', body: null });
    expect((await one<{ comment_count: number }>(`SELECT comment_count FROM library_posts WHERE id = $1`, [theirs.id])).comment_count).toBe(0);
    expect((await one<{ body: string }>(`SELECT body FROM dm_messages WHERE id = $1`, [dm.id])).body).toBe(MODERATED_MESSAGE_BODY);
    expect(await one(`SELECT bio, display_name, country FROM users WHERE id = $1`, [rojda.id])).toEqual({ bio: null, display_name: null, country: null });

    // the group passes on, and its new owner is told
    expect((await one<{ owner_id: string }>(`SELECT owner_id FROM groups WHERE id = $1`, [group.id])).owner_id).toBe(friend.id);
    const told = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'group_owner_changed'`, [friend.id]);
    expect(told.rowCount).toBe(1);

    // unavailable to everyone: profile, friends list, search, messages
    const profile = await call('GET', `/users/${rojda.id}`, friend.token);
    expect(profile.statusCode).toBe(404);
    expect(profile.json().code).toBe('ACCOUNT_UNAVAILABLE');
    const friends = await call('GET', `/friends`, friend.token);
    expect(JSON.stringify(friends.json())).not.toContain(rojda.id);
    const found = await call('GET', `/users/search?q=${encodeURIComponent(rojda.username)}`, friend.token);
    expect(JSON.stringify(found.json())).not.toContain(rojda.id);
    const message = await call('POST', `/chat/${rojda.id}/messages`, friend.token, { body: 'tu li wir î?' });
    expect(message.statusCode).toBe(403);
    expect(message.json().code).toBe('ACCOUNT_UNAVAILABLE');

    // the statement of reasons is emailed, with what happens to the content and until when
    const mail = emails.find((e) => e.to === rojda.email);
    expect(mail?.template).toBe('account-suspended');
    expect(mail?.vars.content).toContain('hidden from everyone until the suspension ends');
    expect(mail?.vars.statement).toBe('You kept sending hurtful messages.');
    expect((await one<{ notice_email_state: string }>(`SELECT notice_email_state FROM sanctions WHERE user_id = $1 AND kind = 'suspension'`, [rojda.id])).notice_email_state).toBe('sent');

    // and the signals are on the registry
    const signals = await pool.query<{ kind: string }>(`SELECT kind FROM ban_registry WHERE user_id = $1`, [rojda.id]);
    expect(signals.rows.map((r) => r.kind)).toContain('email');

    const lifted = await call('POST', `/admin/users/${rojda.id}/unban`, mod.token, { reason: 'decided too fast' });
    expect(lifted.statusCode).toBe(200);
    expect((await one<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [post.id])).status).toBe('published');
    expect(await one(`SELECT status, body FROM library_comments WHERE id = $1`, [comment.id])).toEqual({ status: 'visible', body: 'Pir xweş' });
    expect((await one<{ comment_count: number }>(`SELECT comment_count FROM library_posts WHERE id = $1`, [theirs.id])).comment_count).toBe(1);
    expect((await one<{ body: string }>(`SELECT body FROM dm_messages WHERE id = $1`, [dm.id])).body).toBe('silav');
    expect(await one(`SELECT bio, display_name, country FROM users WHERE id = $1`, [rojda.id])).toEqual({ bio: 'Ez ji Amedê me', display_name: 'Rojda', country: 'TR' });
    expect((await pool.query(`SELECT 1 FROM ban_registry WHERE user_id = $1`, [rojda.id])).rowCount).toBe(0);
    expect((await call('GET', `/users/${rojda.id}`, friend.token)).statusCode).toBe(200);
  });

  it('Hide comes back when a suspension ends; Remove does not, and goes for good after the window', async () => {
    const hidden = await person('ends');
    const post = await one<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at) VALUES ($1, 'user', 'poem', 'Dawî', 'Peyv', 'published', now()) RETURNING id`,
      [hidden.id],
    );
    expect((await ban(hidden, { kind: 'suspension', durationHours: 1, content: { choice: 'hide' } })).statusCode).toBe(201);
    await pool.query(`UPDATE sanctions SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 second' WHERE user_id = $1 AND kind = 'suspension'`, [hidden.id]);
    await settle();
    expect((await one<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [post.id])).status).toBe('published');

    const removed = await person('remove');
    const key = `image-post/${removed.id}/${'c'.repeat(64)}.webp`;
    await seedPictureUpload(pool, key, removed.id);
    await storage.put(key, Buffer.from('picture'), 'image/webp');
    const picture = await one<{ id: string }>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category, status) VALUES ($1, 'user', $2, 'Wêne', 'image', 'published') RETURNING id`,
      [removed.id, key],
    );
    const res = await ban(removed, { kind: 'suspension', durationHours: 1, content: { choice: 'remove' } });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().takedown).toMatchObject({ posts: 1, pictures: 1 });
    // off the public bucket at once, kept privately for the appeal window
    expect((await one<{ scan_status: string }>(`SELECT scan_status FROM media_uploads WHERE key = $1`, [key])).scan_status).toBe('withdrawn');
    expect(await storage.exists(key)).toBe(false);

    await pool.query(`UPDATE sanctions SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 second' WHERE user_id = $1 AND kind = 'suspension'`, [removed.id]);
    await settle();
    expect((await one<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [picture.id])).status).toBe('removed');

    await pool.query(`UPDATE ban_takedowns SET purge_after = now() - interval '1 second' WHERE user_id = $1`, [removed.id]);
    expect(await purgeDue(pool)).toBeGreaterThanOrEqual(1);
    expect((await pool.query(`SELECT 1 FROM image_posts WHERE id = $1`, [picture.id])).rowCount).toBe(0);
    expect((await one<{ state: string }>(`SELECT state FROM ban_takedowns WHERE user_id = $1`, [removed.id])).state).toBe('purged');
  });

  it('refuses the same identity, holds a returning device, and a person decides', async () => {
    const device = `install-${kit.suffix}-a`;
    // the banned person signs up on their phone
    const regBanned = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'x-device-id': device },
      payload: {
        email: `bn.first.${kit.suffix}+x@gmail.com`,
        username: `bnfirst${kit.suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: kit.ip(),
    });
    expect(regBanned.statusCode, regBanned.body).toBe(201);
    const bannedId = regBanned.json().user.id as string;
    created.push(bannedId);
    const bannedPerson = { id: bannedId, username: `bnfirst${kit.suffix}`.slice(0, 30) } as Person;
    const res = await ban(bannedPerson, { kind: 'permanent_ban', confirmUsername: bannedPerson.username, content: { choice: 'keep' } });
    expect(res.statusCode, res.body).toBe(201);

    const signUp = (email: string, deviceId: string | null) =>
      app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: deviceId ? { 'x-device-id': deviceId } : {},
        payload: { email, username: `bn${Math.random().toString(36).slice(2, 9)}`, password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
        remoteAddress: kit.ip(),
      });

    // the same address, written another way: the usual refusal
    const again = await signUp(`bnfirst${kit.suffix}+again@googlemail.com`, null);
    expect(again.statusCode).toBe(400);
    expect(again.json().code).toBe('SIGNUP_REJECTED');

    // another address on the same phone: made, and held
    const held = await signUp(`bn_other_${kit.suffix}@it.kurda.app`, device);
    expect(held.statusCode, held.body).toBe(201);
    const heldId = held.json().user.id as string;
    created.push(heldId);
    const heldToken = held.json().tokens.accessToken as string;
    await pool.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [heldId]);
    const me = await call('GET', '/me', heldToken);
    expect(me.json().user.accountHold).toEqual({ reason: 'possible_return', since: expect.any(String) });
    // learning goes on; posting and messaging wait
    const post = await call('POST', '/library/posts', heldToken, { type: 'poem', title: 'Helbest', body: 'Rûpel', publish: true });
    expect(post.statusCode).toBe(403);
    expect(post.json().code).toBe('ACCOUNT_HELD');
    const group = await call('POST', '/groups', heldToken, { name: 'Koma nû' });
    expect(group.json().code).toBe('ACCOUNT_HELD');

    // in the queue, with what matched
    const queue = await call('GET', '/admin/moderation/possible-returns', mod.token);
    const entry = (queue.json().items as Array<{ id: string; account: { id: string }; strength: string; signals: Array<{ kind: string }> }>).find(
      (i) => i.account.id === heldId,
    );
    expect(entry?.strength).toBe('strong');
    expect(entry?.signals.map((s) => s.kind)).toContain('device');
    // and on the banned person's page
    const panel = await call('GET', `/admin/users/${bannedId}/possible-matches`, mod.token);
    expect(JSON.stringify(panel.json().items)).toContain(heldId);

    // the hold is a decision they can read in Account standing, without what matched or whose account, and appeal
    const standing = (await call('GET', '/me/standing', heldToken)).json();
    const hold = standing.active.find((x: { kind: string }) => x.kind === 'post_mute');
    expect(hold).toMatchObject({ hold: true, policy: 'other', endsAt: null, origin: 'automatic', reviewedByPerson: false, appeal: { allowed: true } });
    expect(hold.statement).toContain('A person is checking your account');
    expect(JSON.stringify(standing)).not.toContain(bannedId);
    // marked as the hold in its notice too, whose words name no rule
    const told = await one<{ title: string; body: string; data: Record<string, unknown> }>(
      `SELECT title, body, data FROM notifications WHERE user_id = $1 AND data->>'sanctionId' = $2`,
      [heldId, hold.id],
    );
    expect(told.data).toEqual({ kind: 'sanction', sanctionId: hold.id, sanction: 'post_mute', policy: 'other', until: null, hold: true });
    expect(`${told.title} ${told.body}`).not.toMatch(/rule/i);
    // and nothing else on their standing is marked so
    expect(standing.active.filter((x: { hold?: boolean }) => x.hold)).toHaveLength(1);
    expect(standing.restrictions).toEqual({ chat: { until: null }, post: { until: null }, media: { until: null } });
    const appealed = await call('POST', '/me/appeals', heldToken, { sanctionId: hold.id, text: 'This is my sister’s tablet.' });
    expect(appealed.statusCode, appealed.body).toBe(201);
    const withAppeal = await call('GET', '/admin/moderation/possible-returns', mod.token);
    expect(JSON.stringify(withAppeal.json().items)).toContain('This is my sister’s tablet.');

    // not the same person: the hold ends, they are told as for any lifted restriction, their apps are pinged, and the
    // pair is never flagged again
    pings.length = 0;
    const cleared = await call('POST', `/admin/moderation/possible-returns/${entry!.id}/decide`, mod.token, { decision: 'not_same_person', note: 'siblings' });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect((await call('GET', '/me', heldToken)).json().user.accountHold).toBeNull();
    expect(pings).toContain(heldId);
    const lifted = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'sanction_lifted' AND data->>'sanctionId' = $2`, [heldId, hold.id]);
    expect(lifted.rowCount).toBe(1);
    expect((await call('GET', '/me/standing', heldToken)).json().restrictions).toEqual({});
    const rechecked = await app.returns.assess({ userId: heldId, event: 'signin', deviceId: device });
    expect(rechecked.held).toBe(false);
    const audit = await pool.query(`SELECT action FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at`, [heldId]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['possible_return_hold', 'possible_return_cleared']));

    // a third account on the phone is the same person: the ban is applied to it too, linked, with its own notice
    const third = await signUp(`bn_third_${kit.suffix}@it.kurda.app`, device);
    const thirdId = third.json().user.id as string;
    created.push(thirdId);
    const thirdEntry = await one<{ id: string }>(`SELECT id FROM possible_returns WHERE user_id = $1`, [thirdId]);
    const same = await call('POST', `/admin/moderation/possible-returns/${thirdEntry.id}/decide`, mod.token, {
      decision: 'same_person',
      note: 'same device and the same words',
      statement: 'This account belongs to someone whose account was closed. Opening another one to get round that is not allowed.',
      confirmUsername: third.json().user.username,
    });
    expect(same.statusCode, same.body).toBe(200);
    expect(same.json().entry.status).toBe('same_person');
    // the hold gives way to the ban, whose own notice is the news
    expect((await one<{ held_at: Date | null }>(`SELECT held_at FROM users WHERE id = $1`, [thirdId])).held_at).toBeNull();
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1 AND kind = 'post_mute' AND revoked_at IS NULL`, [thirdId])).rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'sanction' = 'permanent_ban'`, [thirdId])).rowCount).toBe(1);
    const linked = await one<{ kind: string; meta: { linkedTo?: string } }>(`SELECT kind, meta FROM sanctions WHERE user_id = $1 AND kind <> 'post_mute'`, [thirdId]);
    expect(linked.kind).toBe('permanent_ban');
    expect(linked.meta.linkedTo).toEqual(expect.any(String));

    // lifting the first ban ends what is left open about it
    expect((await call('POST', `/admin/users/${bannedId}/unban`, mod.token, { reason: 'overturned' })).statusCode).toBe(200);
    const open = await pool.query(`SELECT 1 FROM possible_returns WHERE banned_user_id = $1 AND status = 'open'`, [bannedId]);
    expect(open.rowCount).toBe(0);
  });

  it('a hold ends with the suspension it was about, when that runs out by itself', async () => {
    const device = `install-${kit.suffix}-b`;
    const reg = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-device-id': device },
        payload: { email, username: `bn${Math.random().toString(36).slice(2, 9)}`, password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
        remoteAddress: kit.ip(),
      });
    const first = await reg(`bn_runout1_${kit.suffix}@it.kurda.app`);
    const firstId = first.json().user.id as string;
    created.push(firstId);
    expect((await ban({ id: firstId } as Person, { kind: 'suspension', durationHours: 2 })).statusCode).toBe(201);
    const second = await reg(`bn_runout2_${kit.suffix}@it.kurda.app`);
    const secondId = second.json().user.id as string;
    created.push(secondId);
    expect((await one<{ held_at: Date | null }>(`SELECT held_at FROM users WHERE id = $1`, [secondId])).held_at).not.toBeNull();

    await pool.query(`UPDATE sanctions SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 second' WHERE user_id = $1`, [firstId]);
    await pool.query(`UPDATE users SET banned_until = now() - interval '1 second' WHERE id = $1`, [firstId]);
    for (const bannedId of await returnsToClose(pool)) await inTransaction(pool, (c) => closeReturnsOf(c, new SanctionsService(pool), bannedId));
    expect((await one<{ held_at: Date | null }>(`SELECT held_at FROM users WHERE id = $1`, [secondId])).held_at).toBeNull();
    expect((await one<{ status: string }>(`SELECT status FROM possible_returns WHERE user_id = $1`, [secondId])).status).toBe('closed');
  });

  it('a network alone never holds anyone', async () => {
    // a network of its own each run: sign-up caps count accounts per network for a day
    const shared = `10.164.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
    const first = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `bn_net1_${kit.suffix}@it.kurda.app`, username: `bnnet1${kit.suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: shared,
    });
    const firstId = first.json().user.id as string;
    created.push(firstId);
    await ban({ id: firstId } as Person, { kind: 'suspension', durationHours: 24 });
    const second = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `bn_net2_${kit.suffix}@it.kurda.app`, username: `bnnet2${kit.suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6, timezone: 'Europe/Berlin' },
      remoteAddress: shared,
    });
    expect(second.statusCode).toBe(201);
    created.push(second.json().user.id);
    const held = await one<{ held_at: Date | null }>(`SELECT held_at FROM users WHERE id = $1`, [second.json().user.id]);
    expect(held.held_at).toBeNull();
  });

  it('keeps the GDPR rights: the appeal token reaches the data copy and deleting the account', async () => {
    const who = await person('gdpr');
    expect((await ban(who, { kind: 'suspension', durationHours: 24 })).statusCode).toBe(201);
    const login = await kit.login(who);
    expect(login.statusCode).toBe(403);
    const appealToken = login.json().details.appealToken as string;
    expect((await call('GET', '/me', appealToken)).statusCode).not.toBe(200);
    expect((await call('GET', '/me/export', appealToken)).statusCode).toBe(200);
    // reached (a test app has no private bucket for the copy itself, so it answers 503 rather than 401 or 403)
    expect([202, 503]).toContain((await call('POST', '/me/export', appealToken)).statusCode);
    const gone = await call('DELETE', '/me', appealToken);
    expect(gone.statusCode).toBe(200);
    expect(gone.json()).toEqual({ deletionScheduled: true, graceDays: 14 });
    // and can change their mind, though they cannot sign in to cancel it
    const kept = await call('POST', '/me/deletion/cancel', appealToken);
    expect(kept.json()).toEqual({ cancelled: true });
    expect((await one<{ deletion_requested_at: Date | null }>(`SELECT deletion_requested_at FROM users WHERE id = $1`, [who.id])).deletion_requested_at).toBeNull();
    expect((await call('POST', '/me/deletion/cancel', appealToken)).json()).toEqual({ cancelled: true });
    // deleting keeps the moderation record
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1`, [who.id])).rowCount).toBe(1);
  });

  it('trusted networks are a superadmin’s, with a reason and an end within a year, and lift the sign-up cap', async () => {
    const school = '10.163.240.9';
    expect((await call('POST', '/admin/trusted-networks', mod.token, { ip: school, reason: 'school', expiresAt: new Date(Date.now() + 86_400_000).toISOString() })).statusCode).toBe(403);
    const tooLong = await call('POST', '/admin/trusted-networks', root.token, { ip: school, reason: 'school', expiresAt: new Date(Date.now() + 400 * 86_400_000).toISOString() });
    expect(tooLong.statusCode).toBe(400);
    const added = await call('POST', '/admin/trusted-networks', root.token, {
      ip: school,
      reason: 'Class 7 at the Amed school',
      expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    });
    expect(added.statusCode, added.body).toBe(201);
    expect(added.json().network.hint).toBe('10.163.240.x');

    // eleven sign-ups from the school today would be over the network cap of ten; trusted, they are not
    const netHash = networkHashOf(school)!;
    await pool.query(
      `INSERT INTO risk_decisions (event, net_hash, score, band, action) SELECT 'signup', $1, 0, 'low', 'proceed' FROM generate_series(1, 11)`,
      [netHash],
    );
    const risk = new RiskService(pool);
    expect((await risk.assessSignup({ ip: school })).assessment.hardBlock).toBe(false);

    const list = await call('GET', '/admin/trusted-networks', root.token);
    const id = (list.json().networks as Array<{ id: string; hint: string }>).find((n) => n.hint === '10.163.240.x')!.id;
    expect((await call('DELETE', `/admin/trusted-networks/${id}`, root.token, { reason: 'the term ended' })).statusCode).toBe(200);
    expect((await risk.assessSignup({ ip: school })).assessment.hardBlock).toBe(true);
    const audit = await pool.query(`SELECT action FROM admin_actions WHERE admin_id = $1 AND action LIKE 'trusted_network_%'`, [root.id]);
    expect(audit.rows.map((r) => r.action).sort()).toEqual(['trusted_network_add', 'trusted_network_remove']);
    await pool.query(`DELETE FROM risk_decisions WHERE net_hash = $1`, [netHash]);
  });
});
