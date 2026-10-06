/**
 * Age at sign-up and the protections for minors, against real Postgres.
 *
 * Minor status is never stored: every rule here reads it from the birth month
 * at the moment of asking (users/age.ts). So the suites below set up accounts
 * of a given age through the real sign-up and the real one-time question, and
 * then check each rule from the outside — what an adult stranger can and cannot
 * do to reach a minor.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { isMinor } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { minorSql } from './age.js';
import { LeagueService } from '../leagues/service.js';
import { weekStart } from '../leagues/league-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('age and minors (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let ipCounter = 0;
  /** a fresh address per request that is rate limited per IP */
  const ip = (): string => {
    ipCounter += 1;
    return `10.140.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  };

  interface Account {
    id: string;
    token: string;
    username: string;
  }

  const register = (tag: string, birth?: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `mn_${tag}_${suffix}@it.kurda.app`,
        username: `mn_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...birth,
      },
      remoteAddress: ip(),
    });

  /** A confirmed account of the given age; null = no birth month given. */
  const signUp = async (tag: string, years: number | null): Promise<Account> => {
    const res = await register(tag, years === null ? undefined : bornYearsAgo(years));
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    const body = res.json();
    return { id: body.user.id, token: body.tokens.accessToken, username: body.user.username };
  };

  const call = (
    who: Account | null,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      remoteAddress: ip(),
    });

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
      await client.query(`DELETE FROM groups WHERE name LIKE '%${suffix}'`);
      // closed accounts are anonymized, so their address no longer carries the suffix
      await client.query(
        `DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app' OR id = ANY($1::uuid[])`,
        [closed],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });
  const closed: string[] = [];

  describe('the age rule in SQL', () => {
    it('agrees with @kurda/shared for every birth month around the lines', async () => {
      const now = new Date();
      const cases: Array<{ year: number; month: number }> = [];
      for (let y = now.getUTCFullYear() - 19; y <= now.getUTCFullYear() - 12; y++) {
        for (let m = 1; m <= 12; m++) cases.push({ year: y, month: m });
      }
      const rows = await pool.query<{ year: number; month: number; minor: boolean }>(
        `SELECT u.birth_year AS year, u.birth_month AS month, ${minorSql('u')} AS minor
           FROM unnest($1::int[], $2::int[]) AS u(birth_year, birth_month)`,
        [cases.map((c) => c.year), cases.map((c) => c.month)],
      );
      for (const r of rows.rows) {
        expect(r.minor, `${r.year}-${r.month}`).toBe(isMinor({ year: r.year, month: r.month }, now));
      }
    });
  });

  describe('signing up', () => {
    it('makes no account for someone under 13, and says why', async () => {
      const res = await register('child', bornYearsAgo(12));
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('UNDER_MINIMUM_AGE');
      const row = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [`mn_child_${suffix}@it.kurda.app`]);
      expect(row.rowCount).toBe(0);
    });

    it('refuses a birth month that cannot be real', async () => {
      const next = new Date();
      next.setUTCMonth(next.getUTCMonth() + 1);
      const future = await register('future', { birthYear: next.getUTCFullYear(), birthMonth: next.getUTCMonth() + 1 });
      expect(future.statusCode).toBe(400);
      expect(future.json().code).toBe('INVALID_BIRTH_MONTH');

      const half = await register('half', { birthYear: 1990 });
      expect(half.statusCode).toBe(400);
      expect(half.json().code).toBe('VALIDATION_ERROR');
    });

    it('an adult account is public to members, in the leagues, with reminders on', async () => {
      const adult = await signUp('adult', 30);
      const me = (await call(adult, 'GET', '/me')).json().user;
      expect(me).toMatchObject({
        birthDateRequired: false,
        minor: false,
        restrictedMode: false,
        leaguesEnabled: true,
        profileVisibility: 'members',
      });
      expect((await call(adult, 'GET', '/me/notification-prefs')).json().streak).toBe(true);
    });

    it('a minor starts private, out of the leagues and without streak reminders', async () => {
      const res = await register('teen', bornYearsAgo(15));
      expect(res.statusCode).toBe(201);
      expect(res.json().user.birthDateRequired).toBe(false);
      await activate(app, pool, res);
      const teen = { id: res.json().user.id, token: res.json().tokens.accessToken, username: '' };

      const me = (await call(teen, 'GET', '/me')).json().user;
      expect(me).toMatchObject({
        minor: true,
        restrictedMode: true,
        leaguesEnabled: false,
        profileVisibility: 'friends',
      });
      expect((await call(teen, 'GET', '/me/notification-prefs')).json().streak).toBe(false);

      // a month and a year, and never a full date or a stored verdict
      const row = await pool.query(`SELECT birth_year, birth_month, birth_date FROM users WHERE id = $1`, [teen.id]);
      const { birthYear, birthMonth } = bornYearsAgo(15);
      expect(row.rows[0]).toEqual({ birth_year: birthYear, birth_month: birthMonth, birth_date: null });
    });

    it('an account made without a birth month is asked for one', async () => {
      const res = await register('noage');
      expect(res.statusCode).toBe(201);
      expect(res.json().user.birthDateRequired).toBe(true);
      await activate(app, pool, res);
      const me = await call({ id: '', token: res.json().tokens.accessToken, username: '' }, 'GET', '/me');
      expect(me.json().user.birthDateRequired).toBe(true);
    });
  });

  describe('the one-time birth month question', () => {
    it('is answered once and cannot be changed after', async () => {
      const user = await signUp('once', null);
      const first = await call(user, 'POST', '/me/birth-date', bornYearsAgo(25));
      expect(first.statusCode).toBe(200);
      expect(first.json().user).toMatchObject({ birthDateRequired: false, minor: false });

      // not even to an age that would lift or add protections
      const again = await call(user, 'POST', '/me/birth-date', bornYearsAgo(40));
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('BIRTH_DATE_ALREADY_SET');
      const row = await pool.query(`SELECT birth_year FROM users WHERE id = $1`, [user.id]);
      expect(row.rows[0].birth_year).toBe(bornYearsAgo(25).birthYear);

      // and an under-13 answer to an account that already has one closes nothing
      const child = await call(user, 'POST', '/me/birth-date', bornYearsAgo(10));
      expect(child.statusCode).toBe(409);
      expect((await call(user, 'GET', '/me')).statusCode).toBe(200);
    });

    it('turns on a minor’s defaults for an account made before we asked', async () => {
      const user = await signUp('late', null);
      // settings from before anyone knew: public to members, reminders on, in
      // this week's league
      await call(user, 'PUT', '/me/notification-prefs', { friends: false });
      await new LeagueService(pool).ensureMembership(user.id);

      const res = await call(user, 'POST', '/me/birth-date', bornYearsAgo(14));
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ minor: true, profileVisibility: 'friends', leaguesEnabled: false });
      expect((await call(user, 'GET', '/me/notification-prefs')).json()).toMatchObject({ streak: false, friends: false });
      const league = await pool.query(`SELECT 1 FROM league_members WHERE user_id = $1 AND week_key = $2`, [
        user.id,
        weekStart(new Date()),
      ]);
      expect(league.rowCount).toBe(0);
    });

    it('closes the account at once for an answer under 13', async () => {
      const user = await signUp('young', null);
      closed.push(user.id);
      const res = await call(user, 'POST', '/me/birth-date', bornYearsAgo(11));
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'UNDER_MINIMUM_AGE', details: { accountClosed: true } });

      // the session is gone and nothing about the child is kept
      expect((await call(user, 'GET', '/me')).statusCode).toBe(401);
      const row = await pool.query(
        `SELECT deleted_at, email, birth_year, display_name FROM users WHERE id = $1`,
        [user.id],
      );
      expect(row.rows[0].deleted_at).not.toBeNull();
      expect(row.rows[0].email).not.toContain(suffix);
      expect(row.rows[0].birth_year).toBeNull();
    });

    it('refuses a month that cannot be real', async () => {
      const user = await signUp('badmonth', null);
      const res = await call(user, 'POST', '/me/birth-date', { birthYear: 1850, birthMonth: 5 });
      expect(res.statusCode).toBe(400);
      expect((await call(user, 'GET', '/me')).json().user.birthDateRequired).toBe(true);
    });
  });

  describe('minors and strangers', () => {
    let adult: Account;
    let friendOfMinor: Account;
    let other: Account;
    let minor: Account;
    let otherMinor: Account;

    beforeAll(async () => {
      adult = await signUp('stranger', 35);
      friendOfMinor = await signUp('pal', 22);
      other = await signUp('other', 40);
      minor = await signUp('kid', 16);
      otherMinor = await signUp('kid2', 15);
    });

    it('an adult cannot find a minor by name, but finds an adult', async () => {
      const hits = (q: string) =>
        call(adult, 'GET', `/users/search?q=${encodeURIComponent(q)}`).then((r) =>
          (r.json().results as Array<{ userId: string }>).map((h) => h.userId),
        );
      expect(await hits(minor.username)).not.toContain(minor.id);
      expect(await hits(other.username)).toContain(other.id);
    });

    it('an adult cannot send a minor a friend request, nor can another minor', async () => {
      const res = await call(adult, 'POST', '/friends/requests', { userId: minor.id });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_ACCEPTING_REQUESTS');
      const fromMinor = await call(otherMinor, 'POST', '/friends/requests', { userId: minor.id });
      expect(fromMinor.statusCode).toBe(403);

      const rows = await pool.query(
        `SELECT 1 FROM friendships WHERE requested_by = ANY($1::uuid[]) AND (user_lo = $2 OR user_hi = $2)`,
        [[adult.id, otherMinor.id], minor.id],
      );
      expect(rows.rowCount).toBe(0);
      expect((await call(minor, 'GET', '/friends/requests')).json().requests).toEqual([]);
    });

    it('a minor can send a request, and it can be accepted', async () => {
      const sent = await call(minor, 'POST', '/friends/requests', { userId: friendOfMinor.id });
      expect(sent.json().outcome).toBe('requested');
      const accepted = await call(friendOfMinor, 'POST', `/friends/requests/${minor.id}/accept`);
      expect(accepted.json().result).toBe('accepted');
    });

    it('a request back to a minor who asked first goes through — it answers theirs', async () => {
      await call(minor, 'POST', '/friends/requests', { userId: other.id });
      const back = await call(other, 'POST', '/friends/requests', { userId: minor.id });
      expect(back.statusCode).toBe(200);
      expect(back.json().outcome).toBe('accepted');
    });

    it('nobody is suggested a minor as a friend of a friend', async () => {
      // adult and friendOfMinor become friends, so friendOfMinor's friends —
      // the minor among them — are adult's friends of friends
      await call(adult, 'POST', '/friends/requests', { userId: friendOfMinor.id });
      await call(friendOfMinor, 'POST', `/friends/requests/${adult.id}/accept`);
      await call(friendOfMinor, 'POST', '/friends/requests', { userId: other.id });
      await call(other, 'POST', `/friends/requests/${friendOfMinor.id}/accept`);

      const suggested = (await call(adult, 'GET', '/friends/suggestions')).json().suggestions as Array<{
        userId: string;
      }>;
      const ids = suggested.map((s) => s.userId);
      expect(ids).toContain(other.id); // the adult friend of a friend is offered
      expect(ids).not.toContain(minor.id);
    });

    it('a minor’s profile can be made more private but never public to everyone', async () => {
      const everyone = await call(minor, 'PUT', '/me/privacy', { visibility: 'everyone' });
      expect(everyone.statusCode).toBe(403);
      expect(everyone.json().code).toBe('VISIBILITY_NOT_ALLOWED');
      expect((await call(minor, 'PUT', '/me/privacy', { visibility: 'members' })).statusCode).toBe(200);
      // an adult may choose the public web
      expect((await call(adult, 'PUT', '/me/privacy', { visibility: 'everyone' })).statusCode).toBe(200);
    });

    it('an "everyone" stored from before is never shown to the public web', async () => {
      await pool.query(`UPDATE users SET profile_visibility = 'everyone' WHERE id = ANY($1::uuid[])`, [
        [minor.id, adult.id],
      ]);
      const minorProfile = (await call(null, 'GET', `/users/${minor.id}`)).json();
      expect(minorProfile.private).toBe(true);
      const adultProfile = (await call(null, 'GET', `/users/${adult.id}`)).json();
      expect(adultProfile.private).toBe(false);
      // members still see it, as 'members' allows
      expect((await call(other, 'GET', `/users/${minor.id}`)).json().private).toBe(false);
    });

    describe('groups', () => {
      let openGroup = '';
      let strangersGroup = '';
      let friendsGroup = '';

      beforeAll(async () => {
        const make = async (owner: Account, name: string, privacy: 'open' | 'invite') => {
          const res = await call(owner, 'POST', '/groups', { name: `${name} ${suffix}`, privacy });
          if (res.statusCode !== 200) throw new Error(`group ${name}: ${res.statusCode} ${res.body}`);
          return res.json().id as string;
        };
        openGroup = await make(adult, 'Open', 'open');
        strangersGroup = await make(adult, 'Strangers', 'invite');
        friendsGroup = await make(friendOfMinor, 'Friends', 'invite');
      });

      it('a minor cannot see, join or start an open group', async () => {
        const join = await call(minor, 'POST', `/groups/${openGroup}/join`);
        expect(join.statusCode).toBe(403);
        expect(join.json().code).toBe('OPEN_GROUPS_ADULTS_ONLY');

        const start = await call(minor, 'POST', '/groups', { name: `Mine ${suffix}`, privacy: 'open' });
        expect(start.statusCode).toBe(403);
        // with no privacy given a group is open, so that is refused too
        expect((await call(minor, 'POST', '/groups', { name: `Mine2 ${suffix}` })).statusCode).toBe(403);

        expect((await call(minor, 'GET', '/groups')).json().groups).toEqual([]);
        const seen = (await call(adult, 'GET', '/groups')).json().groups as Array<{ id: string }>;
        expect(seen.map((g) => g.id)).toContain(openGroup);
      });

      it('a minor can start an invite-only group', async () => {
        const res = await call(minor, 'POST', '/groups', { name: `Ours ${suffix}`, privacy: 'invite' });
        expect(res.statusCode).toBe(200);
      });

      it('only a friend of the minor can add them, and never to an open group', async () => {
        const byStranger = await call(adult, 'POST', `/groups/${strangersGroup}/invite`, { userId: minor.id });
        expect(byStranger.statusCode).toBe(403);
        expect(byStranger.json().code).toBe('NOT_ACCEPTING_INVITES');

        // adult and minor are not friends; friendOfMinor is
        const byFriend = await call(friendOfMinor, 'POST', `/groups/${friendsGroup}/invite`, { userId: minor.id });
        expect(byFriend.statusCode).toBe(200);

        // even a friend who runs an open group cannot put a minor in it
        await call(friendOfMinor, 'POST', `/groups/${openGroup}/join`);
        await pool.query(`UPDATE group_members SET role = 'moderator' WHERE group_id = $1 AND user_id = $2`, [
          openGroup,
          friendOfMinor.id,
        ]);
        const intoOpen = await call(friendOfMinor, 'POST', `/groups/${openGroup}/invite`, { userId: minor.id });
        expect(intoOpen.statusCode).toBe(403);
        expect(intoOpen.json().code).toBe('OPEN_GROUPS_ADULTS_ONLY');
      });

      it('a minor chats in an invite-only group, but not in an open one joined before we knew', async () => {
        const inFriends = await call(minor, 'POST', `/groups/${friendsGroup}/chat`, { body: 'Silav!' });
        expect(inFriends.statusCode).toBe(200);

        // a membership from before the age was known
        await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`, [
          openGroup,
          minor.id,
        ]);
        const send = await call(minor, 'POST', `/groups/${openGroup}/chat`, { body: 'Silav!' });
        expect(send.statusCode).toBe(403);
        expect(send.json().code).toBe('OPEN_GROUPS_ADULTS_ONLY');
        expect((await call(minor, 'GET', `/groups/${openGroup}/chat`)).statusCode).toBe(403);
        // they can still leave
        expect((await call(minor, 'POST', `/groups/${openGroup}/leave`)).statusCode).toBe(200);

        expect((await call(adult, 'POST', `/groups/${openGroup}/chat`, { body: 'Silav!' })).statusCode).toBe(200);
      });
    });
  });
});
