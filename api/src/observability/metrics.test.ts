/**
 * Who may scrape /metrics.
 *
 * It was open to anyone. On the live API it answered 200 with the Node version,
 * the process's memory and uptime, and every route it serves with traffic and
 * error rates — free reconnaissance, and an unmetered request, since /metrics
 * is exempt from the rate limiter.
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { setupMetrics } from './metrics.js';

const TOKEN = 'a-scrape-token-long-enough';

async function serve(env: Record<string, string | undefined>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  setupMetrics(app, loadConfig({ JWT_SECRET: 'x'.repeat(32), ...env }));
  await app.ready();
  return app;
}

const scrape = (app: FastifyInstance, token?: string) =>
  app.inject({
    method: 'GET',
    url: '/metrics',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe('GET /metrics', () => {
  it('is not there at all in production without a token', async () => {
    // the default cannot be to serve an open metrics endpoint — that is the bug
    const app = await serve({ NODE_ENV: 'production', APP_BASE_URL: 'https://mykurda.com' });
    const res = await scrape(app);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('nodejs_version_info');
    await app.close();
  });

  it('serves a scrape to a request carrying the token', async () => {
    const app = await serve({ NODE_ENV: 'production', APP_BASE_URL: 'https://mykurda.com', METRICS_TOKEN: TOKEN });
    const res = await scrape(app, TOKEN);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('process_cpu_user_seconds_total');
    await app.close();
  });

  it('refuses a wrong token, a missing one, and a prefix of the right one', async () => {
    const app = await serve({ NODE_ENV: 'production', APP_BASE_URL: 'https://mykurda.com', METRICS_TOKEN: TOKEN });
    for (const attempt of [undefined, 'wrong', TOKEN.slice(0, -1), `${TOKEN}x`, '']) {
      const res = await scrape(app, attempt);
      expect(res.statusCode, `token ${JSON.stringify(attempt)}`).toBe(401);
      expect(res.body).not.toContain('nodejs_version_info');
    }
    await app.close();
  });

  it('stays open in development, where the process is a laptop', async () => {
    const app = await serve({ NODE_ENV: 'development' });
    expect((await scrape(app)).statusCode).toBe(200);
    await app.close();
  });

  it('still requires the token in development once one is set', async () => {
    const app = await serve({ NODE_ENV: 'development', METRICS_TOKEN: TOKEN });
    expect((await scrape(app)).statusCode).toBe(401);
    expect((await scrape(app, TOKEN)).statusCode).toBe(200);
    await app.close();
  });

  it('refuses a token too short to be worth having', () => {
    expect(() => loadConfig({ JWT_SECRET: 'x'.repeat(32), METRICS_TOKEN: 'short' })).toThrow(
      /METRICS_TOKEN/,
    );
  });
});
