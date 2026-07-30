/**
 * XSS corpus against a real user-text endpoint (KUR-108). Pushes every known
 * attack payload through the profile bio (a representative UGC field) and
 * asserts the stored value can't form executable HTML once rendered — and that
 * Kurdish text with diacritics survives sanitization intact.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { escapeHtml, normalizeKurdish, XSS_PAYLOADS } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('XSS corpus vs. profile bio (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token = '';
  const suffix = Date.now().toString(36);

  const authed = (method: 'GET' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.108.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `xss_${suffix}@it.kurda.app`, username: `xss_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.108.0.1',
    });
    token = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('stores no XSS payload that can form executable HTML on render', async () => {
    for (const payload of XSS_PAYLOADS) {
      const patch = await authed('PATCH', '/me', { bio: payload });
      expect(patch.statusCode).toBe(200);
      const bio: string = patch.json().user.bio ?? '';
      // input sanitizer already strips angle brackets; output escaping closes the rest
      expect(bio, payload).not.toMatch(/[<>]/);
      expect(escapeHtml(bio), payload).not.toMatch(/[<>"']/);
    }
  });

  it('preserves Kurdish text and diacritics through the endpoint (edge case)', async () => {
    const kurdish = 'Jîyan bi kurdî xweştire — ê î û ç ş';
    const patch = await authed('PATCH', '/me', { bio: kurdish });
    expect(patch.json().user.bio).toBe(normalizeKurdish(kurdish));
    // and it round-trips on read
    const me = await authed('GET', '/me');
    expect(me.json().user.bio).toBe(normalizeKurdish(kurdish));
  });
});
