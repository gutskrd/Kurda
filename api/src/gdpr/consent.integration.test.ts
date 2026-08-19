/** Consent + minor protection (KUR-109). Unit + integration. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ageOn, CURRENT_POLICY_VERSION, isRestrictedAge } from './consent.js';

describe('age math (unit)', () => {
  it('computes age respecting the birthday boundary', () => {
    const birth = new Date('2010-07-15');
    expect(ageOn(birth, new Date('2026-07-14'))).toBe(15);
    expect(ageOn(birth, new Date('2026-07-15'))).toBe(16);
  });

  it('flags under-16 as restricted by default', () => {
    expect(isRestrictedAge(new Date('2014-01-01'), 16, new Date('2026-07-06'))).toBe(true);
    expect(isRestrictedAge(new Date('2000-01-01'), 16, new Date('2026-07-06'))).toBe(false);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('consent (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  const register = (body: Record<string, unknown>, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { password: 'a-strong-password1', acceptTerms: true, ...body },
      remoteAddress: ip,
    });

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
    const row = await pool.query(
      `SELECT consent_version, consented_at, restricted_mode FROM users WHERE id = $1`,
      [res.json().user.id],
    );
    expect(row.rows[0].consent_version).toBe(CURRENT_POLICY_VERSION);
    expect(row.rows[0].consented_at).not.toBeNull();
    expect(row.rows[0].restricted_mode).toBe(false);
  });

  it('under-16 birth date switches restricted_mode on', async () => {
    const res = await register(
      {
        email: `kid_${suffix}@it.kurda.app`,
        username: `kid_${suffix}`.slice(0, 30),
        birthDate: `${new Date().getFullYear() - 12}-01-01`,
      },
      '10.15.0.3',
    );
    expect(res.statusCode).toBe(201);
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${res.json().tokens.accessToken}` },
      remoteAddress: '10.15.0.4',
    });
    expect(me.json().user.restrictedMode).toBe(true);
    expect(me.json().user.analyticsConsent).toBe(false); // default OFF
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
