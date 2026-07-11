/** Transactional email suppression + webhook (KUR-098) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { EmailService } from './service.js';
import { StubEmailProvider } from './provider.js';

const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = 'email-webhook-test-secret';

describe.skipIf(!DATABASE_URL)('transactional email (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', EMAIL_WEBHOOK_SECRET: SECRET });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let provider: StubEmailProvider;
  let email: EmailService;
  const suffix = Date.now().toString(36);
  const addr = (n: string) => `${n}_${suffix}@it.kurda.app`;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    provider = new StubEmailProvider();
    email = new EmailService(pool, provider);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM email_suppressions WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('sends a rendered email, then suppresses after a bounce', async () => {
    const to = addr('bouncy');
    const first = await email.send(to, 'verify-email', { link: 'https://k/v' }, 'ku');
    expect(first).toMatchObject({ sent: true, suppressed: false });
    expect(provider.sent.at(-1)).toMatchObject({ to, subject: 'E-nameya xwe piştrast bike' });

    await email.suppress(to, 'bounce');
    expect(await email.isSuppressed(to)).toBe(true);

    const before = provider.sent.length;
    const second = await email.send(to, 'verify-email', { link: 'https://k/v' });
    expect(second).toEqual({ sent: false, suppressed: true });
    expect(provider.sent.length).toBe(before); // nothing new sent
  });

  it('webhook suppresses on complaint, guarded by the shared secret', async () => {
    const to = addr('complainer');

    const noSecret = await app.inject({ method: 'POST', url: '/webhooks/email', payload: { type: 'complaint', email: to } });
    expect(noSecret.statusCode).toBe(401);
    expect(await email.isSuppressed(to)).toBe(false);

    const ok = await app.inject({
      method: 'POST',
      url: '/webhooks/email',
      headers: { 'x-email-secret': SECRET },
      payload: { type: 'complaint', email: to },
    });
    expect(ok.statusCode).toBe(200);
    expect(await email.isSuppressed(to)).toBe(true);
  });
});
