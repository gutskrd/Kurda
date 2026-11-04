/**
 * Guest accounts against real Postgres: a phone gets a guest and, for a day,
 * the same guest back; a guest learns exactly as a signed-in learner does and
 * is refused everything social; nobody else can find the guest; claiming
 * upgrades the same row with the progress on it; leaving and the idle purge
 * close the row at once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';
import { GdprService } from '../gdpr/service.js';
import { LeaderboardService } from '../leaderboards/service.js';
import { GUEST_IDLE_DAYS } from './guest.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface Session {
  id: string;
  token: string;
  username: string;
}

interface DeliveredExercise {
  id: string;
  options?: string[];
}

describe.skipIf(!DATABASE_URL)('guest accounts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let redis: Redis | undefined;
  const suffix = Date.now().toString(36);
  const made: string[] = [];
  let courseId: string;
  let lessonId: string;
  const ex = { mc: '', tr: '' };

  // the guest route is limited per network, so every call comes from its own
  let ipCounter = 0;
  const ip = (): string => {
    ipCounter += 1;
    return `10.188.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  };

  const startGuest = async (device: string | null, body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/auth/guest',
      payload: body,
      headers: device ? { 'x-device-id': device } : {},
      remoteAddress: ip(),
    });

  const guest = async (device: string): Promise<Session> => {
    const res = await startGuest(device);
    if (res.statusCode !== 201) throw new Error(`guest: ${res.statusCode} ${res.body}`);
    const json = res.json();
    made.push(json.user.id);
    return { id: json.user.id, token: json.tokens.accessToken, username: json.user.username };
  };

  const signUp = async (tag: string): Promise<Session> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `g_${tag}_${suffix}@it.kurda.app`,
        username: `g_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    const json = res.json();
    made.push(json.user.id);
    return { id: json.user.id, token: json.tokens.accessToken, username: json.user.username };
  };

  const call = (who: Session | null, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      remoteAddress: ip(),
    });

  /** Play the seeded lesson through, every answer right; the XP it pays lands on the row. */
  const playLesson = async (who: Session) => {
    const start = await call(who, 'GET', `/lessons/${lessonId}/session`);
    expect(start.statusCode).toBe(200);
    const sid = start.json().sessionId as string;
    const options = (start.json().exercises as DeliveredExercise[]).find((e) => e.id === ex.mc)!.options!;
    const first = await call(who, 'POST', `/sessions/${sid}/answers`, { exerciseId: ex.mc, answer: { choice: options.indexOf('Apple') } });
    expect(first.statusCode).toBe(200);
    expect(first.json().verdict).toBe('correct');
    const second = await call(who, 'POST', `/sessions/${sid}/answers`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    expect(second.json().verdict).toBe('correct');
    const done = await call(who, 'POST', `/sessions/${sid}/complete`);
    expect(done.statusCode).toBe(200);
    return done.json();
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);

    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `guest-${suffix}`, titleKu: 'M', titleEn: 'Guests' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Sêv" in English?',
      options: ['Apple', 'Bread', 'Water'],
      correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    await repo.publishLesson(lessonId);
  });

  afterAll(async () => {
    // XP was awarded, and the ledgers only permit DELETE under the admin flag
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [made]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await redis?.quit();
    await pool.end();
    await app.close();
  });

  describe('POST /auth/guest', () => {
    it('makes a guest with a generated name and no address, signed in', async () => {
      const res = await startGuest(`dev-a-${suffix}`, { locale: 'ku', deviceName: 'A phone' });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      made.push(body.user.id);
      expect(body.user).toMatchObject({ guest: true, email: null, displayName: null, emailVerified: true, birthDateRequired: false, locale: 'ku' });
      expect(body.user.username).toMatch(/^heval\d{7}$/);
      expect(body.tokens.accessToken).toBeDefined();
      expect(body.tokens.refreshToken).toBeDefined();

      const row = await pool.query(`SELECT email, password_hash, birth_year, guest, guest_device_hash FROM users WHERE id = $1`, [body.user.id]);
      expect(row.rows[0]).toMatchObject({ email: null, password_hash: null, birth_year: null, guest: true });
      expect(row.rows[0].guest_device_hash).toMatch(/^[0-9a-f]{64}$/);

      const me = await call({ id: body.user.id, token: body.tokens.accessToken, username: body.user.username }, 'GET', '/me');
      expect(me.statusCode).toBe(200);
      expect(me.json().user).toMatchObject({ guest: true, email: null, birthDateRequired: false, needsReconsent: false, leaguesEnabled: false });
    });

    it('hands the same device its guest back within a day, with fresh tokens', async () => {
      const device = `dev-b-${suffix}`;
      const first = await guest(device);
      const again = await startGuest(device);
      expect(again.statusCode).toBe(200);
      expect(again.json().user.id).toBe(first.id);
      expect(again.json().tokens.accessToken).not.toBe(first.token);
      // and the new session works
      const me = await call({ ...first, token: again.json().tokens.accessToken }, 'GET', '/me');
      expect(me.json().user.id).toBe(first.id);
    });

    it('makes another guest for another device, and for a device whose guest is a day old', async () => {
      const device = `dev-c-${suffix}`;
      const first = await guest(device);
      const other = await guest(`dev-d-${suffix}`);
      expect(other.id).not.toBe(first.id);
      await pool.query(`UPDATE users SET created_at = now() - interval '25 hours' WHERE id = $1`, [first.id]);
      const later = await startGuest(device);
      expect(later.statusCode).toBe(201);
      made.push(later.json().user.id);
      expect(later.json().user.id).not.toBe(first.id);
    });

    it('does not hand back a guest that has since been claimed', async () => {
      const device = `dev-e-${suffix}`;
      const first = await guest(device);
      const claim = await call(first, 'POST', '/auth/claim', {
        email: `g_claimed_e_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      });
      expect(claim.statusCode).toBe(200);
      const next = await startGuest(device);
      expect(next.statusCode).toBe(201);
      made.push(next.json().user.id);
      expect(next.json().user.id).not.toBe(first.id);
    });

    it('validates the body like sign-up does', async () => {
      const res = await startGuest(null, { locale: 'xx' });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('a guest learns, and only learns', () => {
    let learner: Session;

    it('starts a lesson, is graded and completes it, with the XP on the row', async () => {
      learner = await guest(`dev-learn-${suffix}`);
      const results = await playLesson(learner);
      expect(results).toMatchObject({ correct: 2, total: 2, firstCompletion: true });
      const me = await call(learner, 'GET', '/me');
      expect(me.json().user.xp).toBeGreaterThan(0);
      expect(me.json().user.streak.current).toBe(1);
    });

    it('is refused on social, public and purchasable routes with GUEST_ACCOUNT', async () => {
      const other = await signUp('target');
      const refusals = [
        call(learner, 'POST', '/friends/requests', { userId: other.id }),
        call(learner, 'GET', `/users/search?q=${other.username.slice(0, 6)}`),
        call(learner, 'GET', '/chat/conversations'),
        call(learner, 'POST', '/shop/gift', { sku: 'anything', toUserId: other.id, idempotencyKey: `k-${suffix}` }),
        call(learner, 'POST', `/posts/poem/${other.id}/like`),
        call(learner, 'GET', '/ranks/me'),
        call(learner, 'GET', '/me/league'),
        call(learner, 'PATCH', '/me', { displayName: 'Somebody' }),
        call(learner, 'PATCH', '/me', { leaguesEnabled: true }),
      ];
      for (const res of await Promise.all(refusals)) {
        expect(res.statusCode).toBe(403);
        expect(res.json().code).toBe('GUEST_ACCOUNT');
      }
    });

    it('may still change the settings that are its own', async () => {
      const res = await call(learner, 'PATCH', '/me', { locale: 'de', skipSpeaking: true });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ locale: 'de', skipSpeaking: true, guest: true });
    });

    it('is nobody anyone else can open', async () => {
      const stranger = await signUp('stranger');
      expect((await call(null, 'GET', `/users/${learner.id}`)).statusCode).toBe(404);
      expect((await call(stranger, 'GET', `/users/${learner.id}`)).statusCode).toBe(404);
      expect((await call(stranger, 'GET', `/users/${learner.id}/activity?kind=games`)).statusCode).toBe(404);
      expect((await call(stranger, 'GET', `/users/${learner.id}/friends`)).statusCode).toBe(404);
      // the guest can still see themselves (GET /me reads the same profile)
      expect((await call(learner, 'GET', `/users/${learner.id}`)).statusCode).toBe(200);
      // search may offer near misses when the name itself is not found; the guest is never among them
      const found = (await call(stranger, 'GET', `/users/search?q=${learner.username}`)).json().results as Array<{ userId: string }>;
      expect(found.map((r) => r.userId)).not.toContain(learner.id);
    });

    it('is on no leaderboard, with the XP it earned', async () => {
      const boards = new LeaderboardService(pool, redis);
      await boards.rebuild('weekly_xp');
      const board = await boards.board('weekly_xp', null, { limit: 100 });
      expect(board.top.map((e) => e.userId)).not.toContain(learner.id);
      // their own score and place are still theirs to see
      expect(board.me).toBeNull();
      const own = await boards.board('weekly_xp', learner.id, { limit: 100 });
      expect(own.me?.score).toBeGreaterThan(0);
    });
  });

  describe('POST /auth/claim', () => {
    it('upgrades the same row in place and keeps the progress', async () => {
      const who = await guest(`dev-claim-${suffix}`);
      await playLesson(who);
      const before = (await call(who, 'GET', '/me')).json().user;
      expect(before.xp).toBeGreaterThan(0);

      const res = await call(who, 'POST', '/auth/claim', {
        email: `g_claim_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
        locale: 'ku',
      });
      expect(res.statusCode).toBe(200);
      const user = res.json().user;
      expect(user).toMatchObject({
        id: who.id,
        guest: false,
        email: `g_claim_${suffix}@it.kurda.app`,
        emailVerified: false,
        username: who.username,
        xp: before.xp,
        birthDateRequired: false,
        needsReconsent: false,
        locale: 'ku',
      });
      expect(user.streak.current).toBe(1);

      const row = await pool.query(
        `SELECT guest, guest_device_hash, password_hash, birth_year, birth_month, consent_version FROM users WHERE id = $1`,
        [who.id],
      );
      expect(row.rows[0]).toMatchObject({ guest: false, guest_device_hash: null, birth_year: 1990, birth_month: 6 });
      expect(row.rows[0].password_hash).toContain('$argon2id$');
      expect(row.rows[0].consent_version).not.toBeNull();
      // a verification code was minted for the new address, as after sign-up
      const code = await pool.query(`SELECT 1 FROM email_verification_codes WHERE user_id = $1`, [who.id]);
      expect(code.rowCount).toBe(1);

      // the session the guest had is still signed in, now as the account
      const me = await call(who, 'GET', '/me');
      expect(me.statusCode).toBe(200);
      expect(me.json().user.guest).toBe(false);
      // and the new address signs in with the password
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `g_claim_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
        remoteAddress: ip(),
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().user.id).toBe(who.id);

      // claiming is once
      const again = await call(who, 'POST', '/auth/claim', {
        email: `g_claim2_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      });
      expect(again.statusCode).toBe(403);
      expect(again.json().code).toBe('NOT_A_GUEST');
    });

    it('takes a chosen username, under the username rules', async () => {
      const who = await guest(`dev-uname-${suffix}`);
      const bad = await call(who, 'POST', '/auth/claim', {
        email: `g_uname_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        username: 'admin',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe('INVALID_USERNAME');
      const res = await call(who, 'POST', '/auth/claim', {
        email: `g_uname_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        username: `chosen_${suffix}`.slice(0, 30),
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.username).toBe(`chosen_${suffix}`.slice(0, 30));
    });

    it('refuses an account that is not a guest', async () => {
      const account = await signUp('notguest');
      const res = await call(account, 'POST', '/auth/claim', {
        email: `g_notguest2_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_A_GUEST');
    });

    it('refuses what sign-up refuses: an address in use, a weak password, a child', async () => {
      const taken = await signUp('taken');
      const who = await guest(`dev-refused-${suffix}`);
      const base = { password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 };

      const dup = await call(who, 'POST', '/auth/claim', { ...base, email: `g_taken_${suffix}@it.kurda.app` });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().code).toBe('REGISTRATION_FAILED');
      expect(dup.json().message).not.toContain(taken.username);

      const weak = await call(who, 'POST', '/auth/claim', { ...base, email: `g_weak_${suffix}@it.kurda.app`, password: 'passwordonly' });
      expect(weak.statusCode).toBe(400);
      expect(weak.json().code).toBe('WEAK_PASSWORD');

      const now = new Date();
      const child = await call(who, 'POST', '/auth/claim', {
        ...base,
        email: `g_child_${suffix}@it.kurda.app`,
        birthYear: now.getUTCFullYear() - 10,
        birthMonth: 1,
      });
      expect(child.statusCode).toBe(403);
      expect(child.json().code).toBe('UNDER_MINIMUM_AGE');

      // none of it touched the row
      const me = await call(who, 'GET', '/me');
      expect(me.json().user).toMatchObject({ guest: true, email: null });
    });
  });

  describe('leaving and the idle purge', () => {
    it('DELETE /me closes a guest at once', async () => {
      const who = await guest(`dev-leave-${suffix}`);
      const res = await call(who, 'DELETE', '/me');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ deletionScheduled: false, deleted: true, graceDays: 0 });
      const row = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [who.id]);
      expect(row.rows[0].deleted_at).not.toBeNull();
      expect((await call(who, 'GET', '/me')).statusCode).toBe(401);
    });

    it('closes guests untouched for sixty days and leaves the rest', async () => {
      const stale = await guest(`dev-stale-${suffix}`);
      const fresh = await guest(`dev-fresh-${suffix}`);
      const seenLately = await guest(`dev-seen-${suffix}`);
      const ago = `now() - make_interval(days => ${GUEST_IDLE_DAYS + 1})`;
      for (const who of [stale, seenLately]) {
        await pool.query(`UPDATE users SET created_at = ${ago} WHERE id = $1`, [who.id]);
        await pool.query(`UPDATE refresh_tokens SET created_at = ${ago} WHERE user_id = $1`, [who.id]);
      }
      // a heartbeat this week keeps the row, however old the sign-in
      await pool.query(`UPDATE users SET last_seen_at = now() - interval '2 days' WHERE id = $1`, [seenLately.id]);

      const closed = await new GdprService(pool).purgeIdleGuests();
      expect(closed).toBeGreaterThanOrEqual(1);
      const rows = await pool.query<{ id: string; deleted_at: Date | null }>(
        `SELECT id, deleted_at FROM users WHERE id = ANY($1)`,
        [[stale.id, fresh.id, seenLately.id]],
      );
      const by = new Map(rows.rows.map((r) => [r.id, r.deleted_at]));
      expect(by.get(stale.id)).not.toBeNull();
      expect(by.get(fresh.id)).toBeNull();
      expect(by.get(seenLately.id)).toBeNull();
      // closed is closed: the session is gone
      expect((await call(stale, 'GET', '/me')).statusCode).toBe(401);
    });
  });
});
