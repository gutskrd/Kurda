/** Admin user management (KUR-101) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { SanctionsService } from '../moderation/sanctions-service.js';
import { UserAdminService } from './user-admin-service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('user admin (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let svc: UserAdminService;
  const suffix = Date.now().toString(36);
  let adminId = '';
  let targetId = '';
  const username = `victimc_${suffix}`.slice(0, 30);

  async function reg(name: string, ip: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${name}_${suffix}@it.kurda.app`, username: name.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip,
    });
    return res.json().user.id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // the only moderator: a permanent ban applies at once (with two, it waits for the second)
    svc = new UserAdminService(pool, new WalletService(pool), {
      sanctions: new SanctionsService(pool, { moderatorCount: async () => 1 }),
    });
    adminId = await reg(`adminc_${suffix}`, '10.101.0.1');
    targetId = await reg(username, '10.101.0.2');
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  /**
   * The panel used to answer nothing until you typed a name, which meant the
   * only way to find an account was to already know it. These are the two
   * things that had to become true: no query lists everybody, and the count is
   * of everybody rather than of the page you happen to be holding.
   */
  it('lists everyone when asked nothing, newest first, and counts them all', async () => {
    const all = await svc.search();
    expect(all.users.length).toBeGreaterThanOrEqual(2);
    expect(all.total).toBeGreaterThanOrEqual(all.users.length);
    expect(all.users.some((u) => u.id === targetId)).toBe(true);

    // newest first: the target registered after the admin did
    const ids = all.users.map((u) => u.id);
    expect(ids.indexOf(targetId)).toBeLessThan(ids.indexOf(adminId));
  });

  it('pages without losing anybody or repeating them', async () => {
    const first = await svc.search(undefined, 1, 0);
    const second = await svc.search(undefined, 1, 1);
    expect(first.users).toHaveLength(1);
    expect(second.users).toHaveLength(1);
    expect(first.users[0]!.id).not.toBe(second.users[0]!.id);
    // the count does not shrink to the size of the page
    expect(first.total).toBe(second.total);
    expect(first.total).toBeGreaterThanOrEqual(2);

    // and nobody can ask for more than a page at a time
    const greedy = await svc.search(undefined, 10_000);
    expect(greedy.users.length).toBeLessThanOrEqual(100);
  });

  it('still narrows to a match, and counts the match rather than the world', async () => {
    const everyone = await svc.search();
    const narrowed = await svc.search(username.slice(0, 6));
    expect(narrowed.users.every((u) => u.username.startsWith(username.slice(0, 6)))).toBe(true);
    expect(narrowed.total).toBeLessThan(everyone.total);
  });

  it('searches by username prefix and returns a detail view', async () => {
    const results = await svc.search(username.slice(0, 6));
    expect(results.users.some((r) => r.id === targetId)).toBe(true);
    expect(results.total).toBeGreaterThanOrEqual(1);

    const detail = (await svc.detail(targetId))!;
    expect(detail.username).toBe(username);
    expect(detail.ban).toBe('active');
    expect(detail.balances.zer).toBe(0);
  });

  it('adjusts the wallet through the ledger with admin_adjustment', async () => {
    const credit = await svc.adjustWallet(adminId, targetId, 'zer', 500, 'goodwill for a support ticket');
    expect(credit.ok).toBe(true);

    const detail = (await svc.detail(targetId))!;
    expect(detail.balances.zer).toBe(500);
    expect(detail.ledger[0]).toMatchObject({ currency: 'zer', amount: 500, reason: 'admin_adjustment' });
    // the action names the admin who took it, by username as well as id
    expect(detail.actions.find((a) => a.action === 'wallet_adjust')).toMatchObject({ adminId, adminUsername: `adminc_${suffix}`.slice(0, 30) });

    // over-debit is refused, balance untouched
    const over = await svc.adjustWallet(adminId, targetId, 'zer', -1000, 'clawback');
    expect(over).toEqual({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect((await svc.detail(targetId))!.balances.zer).toBe(500);
  });

  it('credits once per request key, however often the change is sent, and logs it once', async () => {
    const key = `adj-${suffix}`;
    const first = await svc.adjustWallet(adminId, targetId, 'zer', 40, 'contest prize', key);
    const again = await svc.adjustWallet(adminId, targetId, 'zer', 40, 'contest prize', key);
    expect(first).toEqual({ ok: true, balance: 540 });
    expect(again).toEqual({ ok: true, balance: 540, duplicate: true });
    expect((await svc.detail(targetId))!.balances.zer).toBe(540);
    const logged = await pool.query(
      `SELECT 1 FROM admin_actions WHERE target_user_id = $1 AND action = 'wallet_adjust' AND reason = 'contest prize'`,
      [targetId],
    );
    expect(logged.rowCount).toBe(1);
  });

  it('never lets an admin change their own balance', async () => {
    const own = await svc.adjustWallet(adminId, adminId, 'gems', 1000, 'for me');
    expect(own).toEqual({ ok: false, code: 'SELF_ADJUST' });
    const ledger = await pool.query(`SELECT 1 FROM wallet_ledger WHERE user_id = $1 AND reason = 'admin_adjustment'`, [adminId]);
    expect(ledger.rowCount).toBe(0);
  });

  it('temp-ban sets a ban with expiry and bumps token_version; unban clears it', async () => {
    const before = await pool.query<{ token_version: number }>(`SELECT token_version FROM users WHERE id = $1`, [targetId]);
    const until = new Date(Date.now() + 24 * 3_600_000);
    expect(await svc.tempBan(adminId, targetId, 'harassment', until)).toEqual({ ok: true });

    const after = await pool.query<{ token_version: number; banned_at: Date | null }>(
      `SELECT token_version, banned_at FROM users WHERE id = $1`,
      [targetId],
    );
    expect(after.rows[0]!.token_version).toBe(before.rows[0]!.token_version + 1); // sessions revoked
    expect(after.rows[0]!.banned_at).not.toBeNull();
    expect((await svc.detail(targetId))!.ban).toBe('temp_banned');

    // the only moderator types the username to confirm a permanent ban, on this page too
    await expect(svc.permBan(adminId, targetId, 'repeat offender')).rejects.toMatchObject({ code: 'CONFIRM_USERNAME_REQUIRED' });
    expect((await svc.detail(targetId))!.ban).toBe('temp_banned');
    expect(await svc.permBan(adminId, targetId, 'repeat offender', username)).toEqual({ ok: true });
    expect((await svc.detail(targetId))!.ban).toBe('perm_banned');

    expect(await svc.unban(adminId, targetId, 'appeal granted')).toEqual({ ok: true });
    expect((await svc.detail(targetId))!.ban).toBe('active');
  });

  /**
   * A moderator looking for "who is suspended right now", or which accounts
   * are staff, used to page through everyone. Each filter narrows the list
   * (and its count) to what is true now: an ended suspension is not one.
   */
  it('filters to who is restricted, muted or staff right now, and says so on each row', async () => {
    const prefix = `flt${suffix}`.slice(0, 12);
    const banned = await reg(`${prefix}_ban`, '10.101.0.3');
    const muted = await reg(`${prefix}_mute`, '10.101.0.4');
    const staff = await reg(`${prefix}_staff`, '10.101.0.5');
    const ended = await reg(`${prefix}_ended`, '10.101.0.6');
    expect(await svc.tempBan(adminId, banned, 'spam', new Date(Date.now() + 24 * 3_600_000))).toEqual({ ok: true });
    expect(await svc.mute(adminId, muted, 'insults', new Date(Date.now() + 24 * 3_600_000))).toEqual({ ok: true });
    await pool.query(`UPDATE users SET roles = array_append(roles, 'moderator') WHERE id = $1`, [staff]);
    await pool.query(`UPDATE users SET banned_at = now() - interval '2 days', banned_until = now() - interval '1 day' WHERE id = $1`, [ended]);

    const ids = async (filter?: 'restricted' | 'muted' | 'staff'): Promise<string[]> => (await svc.search(prefix, 100, 0, filter)).users.map((u) => u.id);
    expect(await ids('restricted')).toEqual([banned]);
    expect(await ids('muted')).toEqual([muted]);
    expect(await ids('staff')).toEqual([staff]);
    expect((await svc.search(prefix, 100, 0, 'restricted')).total).toBe(1);
    expect((await ids()).sort()).toEqual([banned, muted, staff, ended].sort());

    const rows = (await svc.search(prefix)).users;
    expect(rows.find((u) => u.id === muted)).toMatchObject({ muted: true, ban: 'active' });
    expect(rows.find((u) => u.id === staff)!.roles).toContain('moderator');
    expect(rows.find((u) => u.id === ended)).toMatchObject({ muted: false, ban: 'active' });
    expect(rows.every((u) => u.limited === false)).toBe(true);

    // a posting mute leaves the account working, but not all of it: the row says so
    await new SanctionsService(pool, { moderatorCount: async () => 1 }).apply(pool, {
      userId: staff,
      kind: 'post_mute',
      policy: 'spam',
      statement: 'Posting the same link again and again.',
      durationHours: 24,
      createdBy: adminId,
      origin: 'moderator',
      notify: false,
    });
    expect((await svc.search(prefix)).users.find((u) => u.id === staff)).toMatchObject({ limited: true, muted: false, ban: 'active' });

    // and the route refuses a filter it does not know, before anything else
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `adminc_${suffix}_${suffix}@it.kurda.app`, password: 'a-strong-password1' } })
    ).json().tokens?.accessToken as string | undefined;
    expect(token).toBeTruthy();
    const bad = await app.inject({ method: 'GET', url: '/admin/users?filter=everyone', headers: { authorization: `Bearer ${token}` } });
    expect(bad.statusCode).toBe(400);

    // a wallet change past a million either way is a slip of the keyboard, refused before anything moves
    for (const amount of [1_000_001, -1_000_001]) {
      const slip = await app.inject({
        method: 'POST',
        url: `/admin/users/${targetId}/wallet`,
        headers: { authorization: `Bearer ${token}` },
        payload: { currency: 'zer', amount, reason: 'typo' },
      });
      expect(slip.statusCode).toBe(400);
    }
  });

  it('says whether the person is a minor, an adult, or has no age on the account', async () => {
    const id = await reg(`age${suffix}`.slice(0, 20), '10.101.0.7');
    expect((await svc.detail(id))!.age).toBe('adult');
    await pool.query(`UPDATE users SET birth_year = extract(year FROM now())::int - 15, birth_month = 1 WHERE id = $1`, [id]);
    expect((await svc.detail(id))!.age).toBe('minor');
    await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [id]);
    expect((await svc.detail(id))!.age).toBe('unknown');
  });

  /**
   * Hevalo+ by days, for testers and reviewers while it cannot be bought:
   * given, extended from where it ends, and every grant in the history.
   */
  describe('granting Hevalo+', () => {
    const plusActions = async (id: string) =>
      (await svc.detail(id))!.actions.filter((a) => a.action === 'plus_grant');

    it('gives it from today, extends it from where it ends, and starts again once it has run out', async () => {
      const id = await reg(`plus${suffix}`.slice(0, 20), '10.101.0.8');
      expect((await svc.detail(id))!.premiumUntil).toBeNull();

      const first = await svc.grantPlus(adminId, id, 30, 'tester for the spring release', undefined, new Date('2026-06-01T12:00:00Z'));
      expect(first).toEqual({ ok: true, premiumUntil: new Date('2026-07-01T12:00:00Z') });
      // ten days in, a week more is added to the end, not to today
      const more = await svc.grantPlus(adminId, id, 7, 'one more week', undefined, new Date('2026-06-10T12:00:00Z'));
      expect(more).toEqual({ ok: true, premiumUntil: new Date('2026-07-08T12:00:00Z') });
      // long after it ran out, it starts from the day it is given
      const again = await svc.grantPlus(adminId, id, 10, 'back for the autumn release', undefined, new Date('2026-09-01T00:00:00Z'));
      expect(again).toEqual({ ok: true, premiumUntil: new Date('2026-09-11T00:00:00Z') });

      expect((await svc.detail(id))!.premiumUntil).toEqual(new Date('2026-09-11T00:00:00Z'));
      const history = await plusActions(id);
      expect(history).toHaveLength(3);
      expect(history.map((a) => a.reason).sort()).toEqual(['back for the autumn release', 'one more week', 'tester for the spring release']);
      expect(history.find((a) => a.reason === 'one more week')).toMatchObject({
        adminId,
        meta: { days: 7, before: '2026-07-01T12:00:00.000Z', after: '2026-07-08T12:00:00.000Z' },
      });
    });

    it('adds the days once per request key, and logs it once', async () => {
      const id = await reg(`plusk${suffix}`.slice(0, 20), '10.101.0.9');
      const key = `plus-${suffix}`;
      const now = new Date('2026-06-01T12:00:00Z');
      const first = await svc.grantPlus(adminId, id, 30, 'reviewer', key, now);
      const again = await svc.grantPlus(adminId, id, 30, 'reviewer', key, now);
      expect(first).toEqual({ ok: true, premiumUntil: new Date('2026-07-01T12:00:00Z') });
      expect(again).toEqual({ ok: true, premiumUntil: new Date('2026-07-01T12:00:00Z'), duplicate: true });
      expect(await plusActions(id)).toHaveLength(1);
      // sent together, the same: the account's lock makes one of them the repeat
      const other = `plus2-${suffix}`;
      const burst = await Promise.all(Array.from({ length: 6 }, () => svc.grantPlus(adminId, id, 5, 'reviewer, extended', other, now)));
      expect(burst.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
      expect((await svc.detail(id))!.premiumUntil).toEqual(new Date('2026-07-06T12:00:00Z'));
      expect(await plusActions(id)).toHaveLength(2);
    });

    it('makes the person a member wherever membership is read', async () => {
      const name = `plusm${suffix}`.slice(0, 20);
      const id = await reg(name, '10.101.0.10');
      const token = (
        await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `${name}_${suffix}@it.kurda.app`, password: 'a-strong-password1' } })
      ).json().tokens.accessToken as string;
      const me = async () => (await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })).json().user;
      expect(await me()).toMatchObject({ premium: false, streak: { maxFreezes: 1 } });
      await svc.grantPlus(adminId, id, 14, 'reviewer for the store listing');
      expect(await me()).toMatchObject({ premium: true, streak: { maxFreezes: 2 } });
    });

    it('refuses an account that does not exist or was closed, and days that are not a whole number in range', async () => {
      expect(await svc.grantPlus(adminId, '00000000-0000-0000-0000-000000000000', 30, 'x')).toEqual({ ok: false, code: 'NOT_FOUND' });
      const closed = await reg(`plusc${suffix}`.slice(0, 20), '10.101.0.11');
      await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [closed]);
      expect(await svc.grantPlus(adminId, closed, 30, 'x')).toEqual({ ok: false, code: 'NOT_FOUND' });
      for (const days of [0, -5, 1.5, 367]) await expect(svc.grantPlus(adminId, targetId, days, 'x')).rejects.toThrow(/whole days/);
    });

  });

  it('refuses actions on an unknown user', async () => {
    expect(await svc.warn(adminId, '00000000-0000-0000-0000-000000000000', 'x')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await svc.detail('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
