/** Consent + minor protection (KUR-109). Unit + integration. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { CURRENT_POLICY_VERSION } from './consent.js';
import { activate } from '../test/activate.js';
import { isBelowConsentAgeRow } from '../users/age.js';
import { bornYearsAgo } from '../test/age.js';

/*
 * The age math itself is @kurda/shared's (age.test.ts); this pins the server's
 * reading of it — derived from the birth month on every ask, never stored.
 */
describe('consent age (unit)', () => {
  it('is below 16 until the month after the sixteenth birthday month', () => {
    const now = new Date('2026-07-06T12:00:00Z');
    expect(isBelowConsentAgeRow({ birth_year: 2010, birth_month: 7 }, now)).toBe(true);
    expect(isBelowConsentAgeRow({ birth_year: 2010, birth_month: 6 }, now)).toBe(false);
    expect(isBelowConsentAgeRow({ birth_year: 2000, birth_month: 1 }, now)).toBe(false);
  });

  it('ends on its own as time passes, with nothing rewritten', () => {
    const row = { birth_year: 2012, birth_month: 3 };
    expect(isBelowConsentAgeRow(row, new Date('2027-01-01T00:00:00Z'))).toBe(true);
    expect(isBelowConsentAgeRow(row, new Date('2028-04-01T00:00:00Z'))).toBe(false);
  });

  it('is not assumed without a birth month', () => {
    expect(isBelowConsentAgeRow({ birth_year: null, birth_month: null })).toBe(false);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('consent (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  const register = async (body: Record<string, unknown>, ip: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { password: 'a-strong-password1', acceptTerms: true, ...body },
      remoteAddress: ip,
    });
    // the tests below re-consent and toggle analytics, which an unconfirmed
    // account cannot do; the invalid-signup cases never get this far
    if (res.statusCode === 201) await activate(app, pool, res);
    return res;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('signup without acceptTerms is a validation error naming the field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `noterms_${suffix}@it.kurda.app`,
        username: `noterms_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
      },
      remoteAddress: '10.15.0.1',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.json().details)).toContain('acceptTerms');
  });

  it('signup stores versioned, timestamped consent', async () => {
    const res = await register(
      { email: `adult_${suffix}@it.kurda.app`, username: `adult_${suffix}`.slice(0, 30) },
      '10.15.0.2',
    );
    expect(res.statusCode).toBe(201);
    const row = await pool.query(`SELECT consent_version, consented_at FROM users WHERE id = $1`, [
      res.json().user.id,
    ]);
    expect(row.rows[0].consent_version).toBe(CURRENT_POLICY_VERSION);
    expect(row.rows[0].consented_at).not.toBeNull();
  });

  // deliberately changed: this sent a 12-year-old's birthDate and expected an
  // account; under 13 is now refused (auth/age.integration.test.ts), and the
  // flag is derived from the stored birth month rather than written once
  it('an under-16 birth month reads as restricted, with analytics off', async () => {
    const res = await register(
      {
        email: `teen_${suffix}@it.kurda.app`,
        username: `teen_${suffix}`.slice(0, 30),
        ...bornYearsAgo(15),
      },
      '10.15.0.3',
    );
    expect(res.statusCode).toBe(201);
    const token = res.json().tokens.accessToken;
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.15.0.4',
    });
    expect(me.json().user.restrictedMode).toBe(true);
    expect(me.json().user.analyticsConsent).toBe(false); // default OFF

    // below 16 that consent is a parent's to give, so it cannot be switched on
    const optIn = await app.inject({
      method: 'POST',
      url: '/me/consent',
      payload: { analytics: true },
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.15.0.4',
    });
    expect(optIn.statusCode).toBe(403);
    expect(optIn.json().code).toBe('PARENTAL_CONSENT_REQUIRED');

    // and the restriction ends by itself once they are 16, nothing rewritten
    await pool.query(`UPDATE users SET birth_year = birth_year - 1 WHERE id = $1`, [res.json().user.id]);
    const older = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.15.0.4',
    });
    expect(older.json().user.restrictedMode).toBe(false);
  });

  it('policy bump → needsReconsent → POST /me/consent clears it', async () => {
    const res = await register(
      { email: `rec_${suffix}@it.kurda.app`, username: `rec_${suffix}`.slice(0, 30) },
      '10.15.0.5',
    );
    const token = res.json().tokens.accessToken;
    const userId = res.json().user.id;

    await pool.query(`UPDATE users SET consent_version = '2020-01-01' WHERE id = $1`, [userId]);
    const stale = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.15.0.6',
    });
    expect(stale.json().user.needsReconsent).toBe(true);

    const reconsent = await app.inject({
      method: 'POST',
      url: '/me/consent',
      payload: { acceptPolicy: true },
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.15.0.7',
    });
    expect(reconsent.statusCode).toBe(200);
    expect(reconsent.json().user.needsReconsent).toBe(false);
    expect(reconsent.json().user.consentVersion).toBe(CURRENT_POLICY_VERSION);
  });

  it('analytics consent toggles on and off', async () => {
    const res = await register(
      { email: `ana_${suffix}@it.kurda.app`, username: `ana_${suffix}`.slice(0, 30) },
      '10.15.0.8',
    );
    const token = res.json().tokens.accessToken;
    const consent = (analytics: boolean) =>
      app.inject({
        method: 'POST',
        url: '/me/consent',
        payload: { analytics },
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.15.0.9',
      });
    expect((await consent(true)).json().user.analyticsConsent).toBe(true);
    expect((await consent(false)).json().user.analyticsConsent).toBe(false);
  });
});
