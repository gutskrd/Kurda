/**
 * The book's routes against the app: open to anyone, holding only the road's
 * chapters that are online — none under test, where the road is not seeded —
 * so they answer that there is no book yet rather than print one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL)('the Hevalo book’s routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp(loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('says which chapters the book holds, to anyone, and has no book while none is online', async () => {
    const which = await app.inject({ method: 'GET', url: '/books/road' });
    expect(which.statusCode).toBe(200);
    expect(which.json()).toEqual({ chapters: [] });

    const book = await app.inject({ method: 'GET', url: '/books/road.pdf' });
    expect(book.statusCode).toBe(404);
    expect(book.json()).toMatchObject({ code: 'NO_BOOK' });
    const one = await app.inject({ method: 'GET', url: '/books/road.pdf?chapter=1' });
    expect(one.json()).toMatchObject({ code: 'NO_BOOK', message: 'that chapter is not online yet' });
    expect((await app.inject({ method: 'GET', url: '/books/road.pdf?chapter=13' })).statusCode).toBe(400);
  });
});
