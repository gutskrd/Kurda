/** Avatar endpoints against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('avatar endpoints (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token: string;
  let userId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `avatar_${suffix}@it.kurda.app`,
        username: `avatar_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.16.0.1',
    });
    token = res.json().tokens.accessToken;
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  const putAvatar = (body: Record<string, unknown>) =>
    app.inject({
      method: 'PUT',
      url: '/me/avatar',
      payload: body,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.16.0.2',
    });

  it('new users get the default avatar (şal û şapik, no paywall)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/avatar',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.16.0.3',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config).toEqual(DEFAULT_AVATAR);
    expect(res.json().svg).toContain('<svg');
  });

  it('saves a customized avatar with base items', async () => {
    const res = await putAvatar({
      ...DEFAULT_AVATAR,
      outfit: 'outfit-kiras-fistan',
      hairStyle: 'hair-guli',
      headwear: 'head-jamadani',
      background: 'bg-ciya',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.outfit).toBe('outfit-kiras-fistan');
    const stored = await pool.query(`SELECT avatar_config FROM users WHERE id = $1`, [userId]);
    expect(stored.rows[0].avatar_config.headwear).toBe('head-jamadani');
  });

  it('rejects unowned premium items with ITEM_NOT_OWNED', async () => {
    const res = await putAvatar({ ...DEFAULT_AVATAR, headwear: 'head-kofi' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ITEM_NOT_OWNED');
    expect(res.json().details.items).toContain('head-kofi');
  });

  it('rejects unknown items with INVALID_AVATAR', async () => {
    const res = await putAvatar({ ...DEFAULT_AVATAR, outfit: 'outfit-does-not-exist' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_AVATAR');
  });

  it('serves the public SVG with cache headers; 404 for unknown users', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/${userId}/avatar.svg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.headers['cache-control']).toContain('max-age');
    expect(res.body).toContain('</svg>');

    const missing = await app.inject({
      method: 'GET',
      url: '/users/00000000-0000-0000-0000-000000000000/avatar.svg',
    });
    expect(missing.statusCode).toBe(404);
  });
});
