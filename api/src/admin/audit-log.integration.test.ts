/** Admin audit log (KUR-104) against real Postgres: auto-capture + immutability. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AuditService } from './audit-service.js';
import { totpCode } from './totp.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin audit log (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let audit: AuditService;
  const suffix = Date.now().toString(36);
  let adminToken = '';
  let adminId = '';
  let targetId = '';

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${adminToken}` }, payload: payload as object, remoteAddress: '10.104.9.9' });

  // The audit write happens in an onResponse hook, which completes after inject
  // resolves — so reads must wait for the row to land rather than assuming it's
  // synchronous with the response.
  async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, tries = 40, delayMs = 25): Promise<T> {
    let value = await fn();
    for (let i = 0; i < tries && !ok(value); i++) {
      await new Promise((r) => setTimeout(r, delayMs));
      value = await fn();
    }
    return value;
  }

  async function reg(name: string, ip: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${name}_${suffix}@it.kurda.app`, username: name.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: ip,
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    audit = new AuditService(pool);
    const admin = await reg(`auditadm_${suffix}`, '10.104.0.1');
    adminId = admin.id;
    adminToken = admin.token;
    targetId = (await reg(`audittgt_${suffix}`, '10.104.0.2')).id;
    await pool.query(`UPDATE users SET roles = '{superadmin}' WHERE id = $1`, [adminId]);
    // enroll + confirm 2FA so requireAdmin passes
    const enroll = await authed('POST', '/admin/2fa/enroll');
    await authed('POST', '/admin/2fa/confirm', { code: totpCode((enroll.json() as { secret: string }).secret) });
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
    // admin_audit_log is intentionally append-only (immutable) — nothing to clean;
    // rows are namespaced by this run's random admin_id and the CI DB is ephemeral.
    await pool.end();
    await app.close();
  });

  it('auto-records a successful admin mutation with actor, action, target, reason', async () => {
    const res = await authed('POST', `/admin/users/${targetId}/warn`, { reason: 'being rude in chat' });
    expect(res.statusCode).toBe(200);

    const entries = await eventually(
      () => audit.search({ adminId }),
      (es) => es.some((e) => e.action === 'POST /admin/users/:id/warn'),
    );
    const warn = entries.find((e) => e.action === 'POST /admin/users/:id/warn');
    expect(warn).toBeDefined();
    expect(warn!.targetId).toBe(targetId);
    expect(warn!.reason).toBe('being rude in chat');
  });

  it('does not record rejected mutations', async () => {
    // missing reason → 400, must not leave an audit row for this action
    await authed('POST', `/admin/users/${targetId}/warn`, { reason: '' });
    const entries = await audit.search({ adminId, action: 'POST /admin/users/:id/warn' });
    // exactly one successful warn recorded from the previous test, none for the 400
    expect(entries).toHaveLength(1);
  });

  it('is append-only — UPDATE and DELETE are rejected at the DB level', async () => {
    await audit.record(pool, { adminId, action: 'test.immutable', targetId: 'x', reason: 'r' });
    await expect(pool.query(`UPDATE admin_audit_log SET reason = 'tampered' WHERE admin_id = $1`, [adminId])).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM admin_audit_log WHERE action = 'test.immutable'`)).rejects.toThrow(/append-only/);
  });

  it('search filters by action prefix and target', async () => {
    const byTarget = await audit.search({ targetId });
    expect(byTarget.every((e) => e.targetId === targetId)).toBe(true);
    const byAction = await audit.search({ action: 'POST /admin/users' });
    expect(byAction.every((e) => e.action.startsWith('POST /admin/users'))).toBe(true);
  });
});
