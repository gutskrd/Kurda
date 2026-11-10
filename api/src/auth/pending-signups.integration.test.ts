/**
 * A sign-up whose address is never confirmed, against real Postgres: it does
 * not keep the address from whoever can confirm it, a mistyped address can be
 * put right, the mail it can cause in a day has a ceiling, it is closed at
 * once when deleted, and after a week it is ended — closed when it was made
 * from nothing, a guest again when a guest made it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GdprService } from '../gdpr/service.js';
import { UNCONFIRMED_SIGNUP_DAYS, VERIFICATION_EMAILS_PER_DAY, addressKey, allowVerificationEmail } from './pending-signups.js';
import { createEmailToken } from './email-tokens.js';
import { createVerificationCode } from './verification-codes.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Session {
  id: string;
  token: string;
  refresh: string;
  username: string;
  email: string;
}

describe.skipIf(!DATABASE_URL)('a sign-up that is never confirmed (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let gdpr: GdprService;
  const suffix = Date.now().toString(36);

  // sign-up is limited per network, so every call comes from its own
  let ipCounter = 0;
  const ip = (): string => {
    ipCounter += 1;
    return `10.201.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  };
  const address = (tag: string): string => `ps_${tag}_${suffix}@it.kurda.app`;

  const register = (tag: string, name = tag) =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: address(tag), username: `ps_${name}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip(),
    });

  const signUp = async (tag: string, name = tag): Promise<Session> => {
    const res = await register(tag, name);
    if (res.statusCode !== 201) throw new Error(`sign-up ${tag}: ${res.statusCode} ${res.body}`);
    const json = res.json();
    return { id: json.user.id, token: json.tokens.accessToken, refresh: json.tokens.refreshToken, username: json.user.username, email: address(tag) };
  };

  const call = (who: Session, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload ? { payload } : {}), remoteAddress: ip() });

  const confirm = async (who: Session): Promise<void> => {
    const code = await createVerificationCode(pool, who.id);
    const res = await call(who, 'POST', '/auth/verify-email-code', { code });
    if (res.statusCode !== 200) throw new Error(`confirming ${who.id}: ${res.statusCode} ${res.body}`);
  };

  const row = async (id: string) =>
    (
      await pool.query<{ email: string | null; guest: boolean; deleted: boolean; verified: boolean; username: string; xp: number }>(
        `SELECT email, guest, deleted_at IS NOT NULL AS deleted, email_verified_at IS NOT NULL AS verified, username, xp FROM users WHERE id = $1`,
        [id],
      )
    ).rows[0]!;

  /** As if the account had been made `days` ago. */
  const age = (id: string, days: number) =>
    pool.query(
      `UPDATE users SET created_at = now() - make_interval(days => $2),
              claimed_from_guest_at = CASE WHEN claimed_from_guest_at IS NULL THEN NULL ELSE now() - make_interval(days => $2) END
        WHERE id = $1`,
      [id, days],
    );

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    gdpr = new GdprService(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM verification_sends WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1 OR email LIKE $2)`, [`%_${suffix}`, `%_${suffix}@it.kurda.app`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1 OR username LIKE $2`, [`%_${suffix}@it.kurda.app`, `%_${suffix}`]);
    await pool.end();
    await app.close();
  });

  describe('the address', () => {
    it('is not kept from whoever can confirm it: a second sign-up with it goes ahead, and the first is closed', async () => {
      const first = await signUp('squat', 'squat1');
      const second = await register('squat', 'squat2');
      expect(second.statusCode).toBe(201);
      expect(second.json().user.id).not.toBe(first.id);

      const gone = await row(first.id);
      expect(gone.deleted).toBe(true);
      expect(gone.email).not.toBe(address('squat'));
      // its name is free again, and its session opens nothing
      expect(gone.username).not.toBe(first.username);
      expect((await call(first, 'GET', '/me')).statusCode).toBe(401);
    });

    it('stays with an account that confirmed it', async () => {
      const owner = await signUp('owned');
      await confirm(owner);
      const again = await register('owned', 'owned2');
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('REGISTRATION_FAILED');
      expect((await row(owner.id)).deleted).toBe(false);
    });

    it('is confirmed by a password reset, which came out of the same mailbox', async () => {
      const who = await signUp('reset');
      const raw = await createEmailToken(pool, who.id, 'password_reset');
      const res = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token: raw, password: 'another-strong-password2' }, remoteAddress: ip() });
      expect(res.statusCode).toBe(200);
      expect((await row(who.id)).verified).toBe(true);
    });
  });

  describe('a mistyped address', () => {
    it('is put right without starting again: the same account, the new address, and only the new code', async () => {
      const who = await signUp('typo');
      const stale = await createVerificationCode(pool, who.id);
      const res = await call(who, 'POST', '/auth/change-pending-email', { email: address('right') });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ sent: true });
      const now = await row(who.id);
      expect(now.email).toBe(address('right'));
      expect(now.username).toBe(who.username);
      expect(now.verified).toBe(false);
      // the code that went to the old address does not confirm the new one
      expect((await call(who, 'POST', '/auth/verify-email-code', { code: stale })).statusCode).not.toBe(200);
      await confirm(who);
      expect((await row(who.id)).verified).toBe(true);
      // and the old address is free
      expect((await register('typo', 'typo2')).statusCode).toBe(201);
    });

    it('cannot be changed to an address a confirmed account has, nor at all once confirmed', async () => {
      const owner = await signUp('held');
      await confirm(owner);
      const who = await signUp('wants');
      const taken = await call(who, 'POST', '/auth/change-pending-email', { email: address('held') });
      expect(taken.statusCode).toBe(409);
      expect(taken.json().code).toBe('REGISTRATION_FAILED');
      expect((await row(who.id)).email).toBe(address('wants'));

      const late = await call(owner, 'POST', '/auth/change-pending-email', { email: address('elsewhere') });
      expect(late.statusCode).toBe(409);
      expect(late.json().code).toBe('ALREADY_VERIFIED');
      expect((await row(owner.id)).email).toBe(address('held'));
    });
  });

  describe('the mail it can cause', () => {
    it('has a ceiling for one account in a day, and asking again says so', async () => {
      const who = await signUp('asks');
      // one went out at sign-up; the rest of the day's are used up here
      for (let i = 1; i < VERIFICATION_EMAILS_PER_DAY; i++) expect(await allowVerificationEmail(pool, who.id, who.email), `send ${i + 1}`).toBe(true);
      expect(await allowVerificationEmail(pool, who.id, who.email)).toBe(false);
      const res = await call(who, 'POST', '/auth/resend-verification-code');
      expect(res.statusCode).toBe(429);
      expect(res.json().code).toBe('VERIFICATION_EMAIL_LIMIT');
      // a day later it is open again
      await pool.query(`UPDATE verification_sends SET sent_at = sent_at - interval '25 hours' WHERE user_id = $1`, [who.id]);
      expect((await call(who, 'POST', '/auth/resend-verification-code')).statusCode).toBe(200);
    });

    it('has the same ceiling for one address, however many sign-ups use it', async () => {
      const victim = address('victim');
      // sign-ups made one after another with a stranger's address, each ending the one before
      for (let i = 0; i < VERIFICATION_EMAILS_PER_DAY; i++) expect((await register('victim', `v${i}`)).statusCode, `sign-up ${i + 1}`).toBe(201);
      const sent = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM verification_sends WHERE address_hash = $1`, [addressKey(victim)]);
      expect(sent.rows[0]!.n).toBe(VERIFICATION_EMAILS_PER_DAY);
      // the next sign-up is still made, so nobody learns anything from it, but no more mail goes to the address
      expect((await register('victim', 'vlast')).statusCode).toBe(201);
      const after = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM verification_sends WHERE address_hash = $1`, [addressKey(victim)]);
      expect(after.rows[0]!.n).toBe(VERIFICATION_EMAILS_PER_DAY);
    });
  });

  describe('deleting it', () => {
    it('closes it at once, with no grace period to come back to', async () => {
      const who = await signUp('leaves');
      const res = await call(who, 'DELETE', '/me');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ deleted: true, deletionScheduled: false, graceDays: 0 });
      expect((await row(who.id)).deleted).toBe(true);
      // the address and the name can be used again straight away
      expect((await register('leaves')).statusCode).toBe(201);
    });

    it('still gives a confirmed account its grace period', async () => {
      const who = await signUp('stays');
      await confirm(who);
      const res = await call(who, 'DELETE', '/me');
      expect(res.json()).toMatchObject({ deletionScheduled: true });
      expect((await row(who.id)).deleted).toBe(false);
    });
  });

  describe('after a week', () => {
    it('ends the sign-ups nobody confirmed, and no others', async () => {
      const old = await signUp('old');
      const recent = await signUp('recent');
      const confirmed = await signUp('kept');
      await confirm(confirmed);
      const staff = await signUp('staff');
      await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [staff.id]);
      const provider = await signUp('linked');
      await pool.query(`INSERT INTO oauth_identities (user_id, provider, provider_user_id) VALUES ($1, 'google', $2)`, [provider.id, `g-ps-${suffix}`]);
      for (const who of [old, confirmed, staff, provider]) await age(who.id, UNCONFIRMED_SIGNUP_DAYS + 1);
      await age(recent.id, UNCONFIRMED_SIGNUP_DAYS - 1);

      expect(await gdpr.purgeUnconfirmedSignups()).toBeGreaterThanOrEqual(1);

      expect((await row(old.id)).deleted).toBe(true);
      for (const who of [recent, confirmed, staff, provider]) expect((await row(who.id)).deleted, who.email).toBe(false);
      // run again, it finds nothing left of these to do
      await gdpr.purgeUnconfirmedSignups();
      expect((await row(recent.id)).deleted).toBe(false);
    });

    it('makes a guest’s unconfirmed claim a guest again, with everything learned still there', async () => {
      const started = await app.inject({ method: 'POST', url: '/auth/guest', payload: {}, headers: { 'x-device-id': `ps-dev-${suffix}` }, remoteAddress: ip() });
      expect(started.statusCode).toBe(201);
      const who: Session = { id: started.json().user.id, token: started.json().tokens.accessToken, refresh: started.json().tokens.refreshToken, username: started.json().user.username, email: address('claim') };
      await pool.query(`UPDATE users SET xp = 120 WHERE id = $1`, [who.id]);
      const claim = await call(who, 'POST', '/auth/claim', { email: who.email, password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 });
      expect(claim.statusCode).toBe(200);
      expect((await row(who.id)).guest).toBe(false);

      await age(who.id, UNCONFIRMED_SIGNUP_DAYS + 1);
      await gdpr.purgeUnconfirmedSignups();

      const back = await row(who.id);
      expect(back).toMatchObject({ guest: true, email: null, deleted: false, xp: 120 });
      // the same phone is still signed in, as the guest it was
      expect((await call(who, 'GET', '/me')).statusCode).toBe(200);
      // and the address is free for whoever it belongs to
      expect((await register('claim', 'claim2')).statusCode).toBe(201);
      await pool.query(`DELETE FROM users WHERE id = $1`, [who.id]);
    });
  });
});
