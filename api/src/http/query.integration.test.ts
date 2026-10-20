/**
 * The public lists check their query strings: a malformed page or id is the
 * caller's mistake (400), not a database error (500).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;
const NO_SUCH = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!DATABASE_URL)('public list query strings (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let n = 0;
  const get = (url: string) => app.inject({ method: 'GET', url, remoteAddress: `10.95.1.${(n++ % 250) + 1}` });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a malformed page, id or repeated key with 400, signed out', async () => {
    for (const url of [
      '/library/posts?limit=abc',
      '/library/posts?offset=-1',
      '/library/posts?authorId=nope',
      '/library/posts?limit=2.5',
      '/images?offset=1e400',
      '/images?authorId=a&authorId=b',
      '/images?sort=newest&sort=popular',
      `/library/posts/${NO_SUCH}/comments?limit=x`,
      `/library/comments/${NO_SUCH}/replies?offset=-3`,
      `/images/${NO_SUCH}/comments?limit=0`,
      `/images/comments/${NO_SUCH}/replies?limit=NaN`,
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(400);
      expect(res.json().code, url).toBe('VALIDATION_ERROR');
    }
  });

  it('still answers what the apps send, empty values and oversized pages included', async () => {
    for (const url of [
      '/library/posts',
      '/library/posts?type=poem&limit=50',
      '/library/posts?limit=100&offset=200',
      '/library/posts?limit=&offset=',
      '/library/posts?limit=500',
      `/library/posts?authorId=${NO_SUCH}&sort=popular&language=ku`,
      '/images?category=meme&sort=newest&limit=20&offset=0',
      '/images?category=anything-else',
      `/library/posts/${NO_SUCH}/comments?limit=20&sort=oldest`,
      `/images/${NO_SUCH}/comments?limit=20`,
      `/images/comments/${NO_SUCH}/replies?limit=20&offset=0`,
    ]) {
      const res = await get(url);
      expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
    }
  });
});
