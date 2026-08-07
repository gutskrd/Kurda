/**
 * Input sanitization (KUR-108): control/invisible characters are stripped from
 * user-visible text on the write paths that previously skipped it (display name,
 * group name/description), while Kurdish diacritics survive intact (the issue's
 * explicit edge case). The shared stripControlChars is unit-tested separately;
 * this pins that it is actually applied end-to-end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { GroupService } from './groups/service.js';

const DATABASE_URL = process.env.DATABASE_URL;
// C0 controls + DEL + a C1 control (none are TAB/LF, which stripControlChars keeps)
const CONTROLS = '\u0000\u0001\u001f\u007f\u009f';
// the control range stripControlChars targets (TAB 09 / LF 0a excluded)
const hasControl = (s: string): boolean => /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(s);

describe.skipIf(!DATABASE_URL)('input sanitization (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  const suffix = Date.now().toString(36);
  let token: string;
  let userId: string;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `san_${suffix}@it.kurda.app`, username: `san_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.108.0.1',
    });
    token = res.json().tokens.accessToken;
    userId = res.json().user.id;
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

  it('strips control chars from a display name but keeps Kurdish diacritics', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: `Şêrko${CONTROLS} Bêkes` },
    });
    expect(patch.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    const display = me.json().user.displayName as string;
    expect(hasControl(display)).toBe(false);
    expect(display).toContain('Şêrko');
    expect(display).toContain('Bêkes');
  });

  it('strips control chars from a group name + description, keeping diacritics', async () => {
    const { id } = await groups.create(userId, { name: `Helbestvan${CONTROLS}`, description: `kurdî${CONTROLS} club` });
    const row = await pool.query<{ name: string; description: string }>(
      `SELECT name, description FROM groups WHERE id = $1`,
      [id],
    );
    const g = row.rows[0]!;
    expect(hasControl(g.name)).toBe(false);
    expect(g.name).toBe('Helbestvan');
    expect(hasControl(g.description)).toBe(false);
    expect(g.description).toContain('kurdî');
  });
});
