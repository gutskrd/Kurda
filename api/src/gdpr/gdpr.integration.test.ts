/** GDPR deletion + export flows (CI integration job; export needs MinIO). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createStorage } from '../media/storage.js';
import { GdprService, DELETION_GRACE_DAYS } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const S3_READY = Boolean(process.env.S3_ENDPOINT);

describe.skipIf(!DATABASE_URL)('GDPR (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  async function makeUser(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
      },
      remoteAddress: `10.13.0.${Math.floor(Math.random() * 200) + 1}`,
    });
    return {
      id: res.json().user.id as string,
      token: res.json().tokens.accessToken as string,
      email: `${name}_${suffix}@it.kurda.app`,
    };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app' OR email LIKE 'deleted_%@deleted.kurda.app'`,
    );
    await pool.end();
    await app.close();
  });

  it('DELETE /me starts the grace period; login cancels it', async () => {
    const user = await makeUser('grace');
    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${user.token}` },
      remoteAddress: '10.13.1.1',
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().graceDays).toBe(DELETION_GRACE_DAYS);

    const marked = await pool.query(`SELECT deletion_requested_at FROM users WHERE id = $1`, [user.id]);
    expect(marked.rows[0].deletion_requested_at).not.toBeNull();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'a-strong-password' },
      remoteAddress: '10.13.1.2',
    });
    expect(login.statusCode).toBe(200);
    const cancelled = await pool.query(`SELECT deletion_requested_at FROM users WHERE id = $1`, [user.id]);
    expect(cancelled.rows[0].deletion_requested_at).toBeNull();
  });

  it('anonymization scrubs PII after the grace period but keeps the row', async () => {
    const user = await makeUser('anon');
    await pool.query(
      `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
      [user.id],
    );
    const service = new GdprService(pool);
    const count = await service.anonymizeExpired();
    expect(count).toBeGreaterThanOrEqual(1);

    const row = await pool.query(
      `SELECT email, username, display_name, password_hash, deleted_at FROM users WHERE id = $1`,
      [user.id],
    );
    expect(row.rowCount).toBe(1); // row kept for aggregates
    expect(row.rows[0].email).toContain('@deleted.kurda.app');
    expect(row.rows[0].username).toContain('deleted_');
    expect(row.rows[0].password_hash).toBeNull();
    expect(row.rows[0].deleted_at).not.toBeNull();

    // sessions dead, old token rejected
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${user.token}` },
      remoteAddress: '10.13.1.3',
    });
    expect([401, 403]).toContain(me.statusCode);

    // rerun is idempotent for this user
    const again = await service.anonymizeExpired();
    expect(again).toBe(0);
  });

  it.skipIf(!S3_READY)('export request → fulfillment → signed download', async () => {
    const user = await makeUser('export');
    const storage = createStorage(
      loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' }),
    );
    const service = new GdprService(pool, { storage });

    const exportId = await service.requestExport(user.id);
    // duplicate request within 24h returns the same export
    expect(await service.requestExport(user.id)).toBe(exportId);

    await service.fulfillExport(exportId);
    await service.fulfillExport(exportId); // idempotent

    const status = await service.exportStatus(user.id);
    expect(status.status).toBe('ready');
    expect(status.downloadUrl).toBeDefined();

    const download = await fetch(status.downloadUrl as string);
    expect(download.status).toBe(200);
    const doc = (await download.json()) as { user: { email: string }; format: string };
    expect(doc.format).toBe('kurda-user-export/v1');
    expect(doc.user.email).toBe(user.email);
    expect(JSON.stringify(doc)).not.toContain('password');
  });

  it('export without storage returns 503 via the route', async () => {
    const user = await makeUser('nostore');
    const res = await app.inject({
      method: 'POST',
      url: '/me/export',
      headers: { authorization: `Bearer ${user.token}` },
      remoteAddress: '10.13.1.4',
    });
    // app built without S3 config in this test file → EXPORT_NOT_AVAILABLE
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('EXPORT_NOT_AVAILABLE');
  });
});
