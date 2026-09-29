/** Starting a dictionary import from the admin API, against real Postgres. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin dictionary import (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let adminToken = '';
  let editorToken = '';
  const userIds: string[] = [];

  const authed = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.99.1.1' });

  async function register(name: string, ip: string, roles: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    await pass2fa(app, token);
    return token;
  }

  /**
   * One empty file. The real source downloads 65 MB over ninety minutes, and
   * the test that asserts a start returns 202 would begin exactly that — the
   * whole point of the endpoint is that it answers before the work is done.
   */
  const emptySource = {
    manifest: () => Promise.resolve({ totalWords: 0, files: [{ file: 'none.json', count: 0 }] }),
    chunk: () => Promise.resolve([]),
  };

  beforeAll(async () => {
    app = buildApp(config, { ferheng: emptySource });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    adminToken = await register('impAdmin', '10.99.0.1', '{admin}');
    editorToken = await register('impEditor', '10.99.0.2', '{content_editor}');
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM dict_import_runs`);
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('reports nothing before anything has been started', async () => {
    const res = await authed('GET', '/admin/dictionary/import', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().run).toBeNull();
    expect(res.json().languages).toMatchObject({ ku: 'kurmanji' });
  });

  /**
   * Importing a language is not editing content: it writes several hundred
   * thousand rows and has no undo. A content editor curates words; this is a
   * different thing behind a different door.
   */
  it('refuses a content editor, who may still curate words', async () => {
    expect((await authed('GET', '/admin/dictionary/import', editorToken)).statusCode).toBe(403);
    expect((await authed('POST', '/admin/dictionary/import', editorToken, { lang: 'ku' })).statusCode).toBe(403);
  });

  it('refuses a language the source does not publish', async () => {
    const res = await authed('POST', '/admin/dictionary/import', adminToken, { lang: 'klingon' });
    expect(res.statusCode).toBe(400);
  });

  /**
   * The request returns long before the work does — an import is about ninety
   * minutes and no browser holds a connection open for that. 202 says so.
   */
  it('accepts the start and answers immediately', async () => {
    const res = await authed('POST', '/admin/dictionary/import', adminToken, { lang: 'ku' });
    expect(res.statusCode).toBe(202);
    expect(res.json().run).toMatchObject({ status: 'running', lang: 'ku', filesDone: 0 });

    // …and the run is readable afterwards, which is how the page follows it
    const status = await authed('GET', '/admin/dictionary/import', adminToken);
    expect(status.json().run.id).toBe(res.json().run.id);
    expect(status.json().run).toHaveProperty('percent');
  });

  it('refuses a second import while one is in flight', async () => {
    await pool.query(`INSERT INTO dict_import_runs (source, lang, status) VALUES ('ferheng', 'ku', 'running')`);
    const res = await authed('POST', '/admin/dictionary/import', adminToken, { lang: 'ku' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('IMPORT_RUNNING');
  });

  it('stops watching a run, and says so when there is nothing to stop', async () => {
    await pool.query(`INSERT INTO dict_import_runs (source, lang, status) VALUES ('ferheng', 'ku', 'running')`);
    const stopped = await authed('DELETE', '/admin/dictionary/import', adminToken);
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().run.status).toBe('cancelled');

    expect((await authed('DELETE', '/admin/dictionary/import', adminToken)).statusCode).toBe(404);
  });
});
