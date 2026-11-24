/**
 * Asking for a copy of one's data, end to end as production runs it: the route queues the export's job, the worker
 * the API runs in its own process takes it, and the copy is then offered through a signed link that saves it as a
 * named JSON file. The bucket is a stand-in for the worker, and the API's own storage signs links for an endpoint that
 * is never called, as signing needs no network.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Worker } from 'bullmq';
import pg from 'pg';
import pino from 'pino';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken } from '../auth/tokens.js';
import { FakeStorage } from '../test/fake-storage.js';
import { JobRegistry } from '../jobs/registry.js';
import { createWorker } from '../jobs/worker.js';
import { makeExportJob } from '../jobs/gdpr-jobs.js';
import { EXPORT_LOST_AFTER_MIN, GdprService, exportFilename, exportJobId } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('downloading one’s data (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    S3_ENDPOINT: 'http://127.0.0.1:9',
    S3_BUCKET: 'kurda-test',
    S3_EVIDENCE_BUCKET: 'kurda-test-private',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
  });
  const suffix = Date.now().toString(36);
  const bucket = new FakeStorage();
  let app: FastifyInstance;
  let pool: pg.Pool;
  let worker: Worker;
  let seq = 0;

  const adult = async (): Promise<{ id: string; token: string }> => {
    const n = seq++;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, email_verified_at) VALUES ($1, $2, 1990, 6, now()) RETURNING id`,
      [`dx${n}_${suffix}@it.kurda.app`, `dx${n}_${suffix}`],
    );
    const id = r.rows[0]!.id;
    return { id, token: await issueAccessToken(config, { sub: id, ver: 0 }) };
  };
  const call = (who: { token: string }, method: 'GET' | 'POST', n: number) =>
    app.inject({ method, url: '/me/export', headers: { authorization: `Bearer ${who.token}` }, remoteAddress: `10.163.0.${n}` });

  /** GET /me/export until it says ready, as the apps poll it. */
  const ready = async (who: { token: string }): Promise<Record<string, string>> => {
    for (let i = 0; i < 100; i++) {
      const status = (await call(who, 'GET', 200)).json() as Record<string, string>;
      if (status.status === 'ready') return status;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('the export never became ready');
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // the worker app.ts starts in production (unless RUN_WORKER_IN_API=false), with the export job it registers there
    const registry = new JobRegistry();
    registry.register(makeExportJob(new GdprService(pool, { storage: bucket.asStorage })));
    worker = createWorker(config, pino({ level: 'silent' }), registry);
  });

  afterAll(async () => {
    await worker.close();
    await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`dx%\\_${suffix}`]);
    await pool.end();
    await app.close();
  });

  it('queues the export, makes it in the background, and offers it as a file to save', async () => {
    const me = await adult();
    const asked = await call(me, 'POST', 1);
    expect(asked.statusCode, asked.body).toBe(202);
    expect(asked.json()).toEqual({ requested: true, reused: false });
    const id = (await pool.query<{ id: string }>(`SELECT id FROM user_exports WHERE user_id = $1`, [me.id])).rows[0]!.id;
    expect(await app.jobs!.raw.getJob(exportJobId(id))).toBeDefined();

    const status = await ready(me);
    expect(bucket.privateFiles.size).toBe(1);
    const url = new URL(status.downloadUrl!);
    expect(url.pathname).toMatch(/^\/kurda-test-private\/user-export\//);
    expect(url.searchParams.get('response-content-disposition')).toBe(`attachment; filename="${exportFilename(new Date(status.completedAt!))}"`);
    expect(url.searchParams.get('response-content-disposition')).toMatch(/^attachment; filename="hevalo-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(url.searchParams.get('response-content-type')).toBe('application/json');

    // asking again the same day keeps that copy, and says so
    const again = await call(me, 'POST', 2);
    expect(again.statusCode).toBe(202);
    expect(again.json()).toEqual({ requested: true, reused: true });
  });

  it('throws away a copy that finished only after its request was withdrawn as lost', async () => {
    const me = await adult();
    const late = new FakeStorage();
    const gdpr = new GdprService(pool, { storage: late.asStorage });
    const { id } = await gdpr.requestExport(me.id);
    const earlier = await gdpr.requestExport(me.id);
    expect(earlier).toEqual({ id, reused: true });
    // withdrawn while the copy was being written
    const put = late.putPrivate.bind(late);
    late.putPrivate = async (key: string, body: Buffer) => {
      await put(key, body);
      await pool.query(`DELETE FROM user_exports WHERE id = $1`, [id]);
    };
    await gdpr.fulfillExport(id);
    expect(late.privateFiles.size).toBe(0);
    expect(await gdpr.exportStatus(me.id)).toEqual({ status: 'none' });
  });

  it('lets someone ask again when a request was lost on the way, rather than wait out the day', async () => {
    const me = await adult();
    const lost = await pool.query<{ id: string }>(
      `INSERT INTO user_exports (user_id, requested_at) VALUES ($1, now() - make_interval(mins => $2)) RETURNING id`,
      [me.id, EXPORT_LOST_AFTER_MIN + 1],
    );
    expect((await call(me, 'GET', 3)).json()).toEqual({ status: 'none' });
    const asked = await call(me, 'POST', 4);
    expect(asked.json()).toEqual({ requested: true, reused: false });
    const rows = await pool.query<{ id: string }>(`SELECT id FROM user_exports WHERE user_id = $1`, [me.id]);
    expect(rows.rows.map((r) => r.id)).not.toContain(lost.rows[0]!.id);
    expect((await ready(me)).status).toBe('ready');
  });
});
