/** Daily goals against real Postgres (CI integration job). KUR-032. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('daily goals (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];

  async function makeUser(ip: string): Promise<{ id: string; token: string }> {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `goal_${suffix}_${ip}@it.kurda.app`,
        username: `goal_${suffix}_${ip}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: `10.40.0.${ip}`,
    });
    const id = reg.json().user.id as string;
    userIds.push(id);
    return { id, token: reg.json().tokens.accessToken };
  }

  const authed = (token: string, method: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.40.0.99' });

  // simulate earned XP without running a full lesson
  async function earn(userId: string, amount: number): Promise<void> {
    await pool.query(
      `INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1, 'test', $2, $3)`,
      [userId, amount, `${userId}:${Math.random()}`],
    );
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('defaults to a goal of 20 with no progress', async () => {
    const u = await makeUser('1');
    const res = await authed(u.token, 'GET', '/me/daily-goal');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ goal: 20, effectiveGoal: 20, earnedXp: 0, progress: 0, completed: false });
  });

  it('tracks progress and completes when XP reaches the goal', async () => {
    const u = await makeUser('2');
    await earn(u.id, 10);
    expect((await authed(u.token, 'GET', '/me/daily-goal')).json()).toMatchObject({
      earnedXp: 10,
      progress: 0.5,
      completed: false,
    });
    await earn(u.id, 10);
    expect((await authed(u.token, 'GET', '/me/daily-goal')).json()).toMatchObject({
      earnedXp: 20,
      progress: 1,
      completed: true,
    });
  });

  it('raising the goal mid-day never claws back progress (min of old/new)', async () => {
    const u = await makeUser('3');
    await earn(u.id, 20); // completes the default goal of 20
    const raised = await authed(u.token, 'PUT', '/me/daily-goal', { goal: 50 });
    // today still judged against 20 → stays complete; 50 applies tomorrow
    expect(raised.json()).toMatchObject({ goal: 50, effectiveGoal: 20, completed: true });
  });

  it('raising with partial progress keeps the lower effective goal', async () => {
    const u = await makeUser('4');
    await earn(u.id, 10); // half of 20
    const raised = await authed(u.token, 'PUT', '/me/daily-goal', { goal: 50 });
    expect(raised.json()).toMatchObject({ effectiveGoal: 20, earnedXp: 10, completed: false });
  });

  it('lowering the goal can complete today going forward', async () => {
    const u = await makeUser('5');
    await earn(u.id, 10); // not enough for 20…
    const lowered = await authed(u.token, 'PUT', '/me/daily-goal', { goal: 10 });
    expect(lowered.json()).toMatchObject({ goal: 10, effectiveGoal: 10, completed: true });
  });

  it('rejects an unsupported goal value', async () => {
    const u = await makeUser('6');
    const res = await authed(u.token, 'PUT', '/me/daily-goal', { goal: 15 });
    expect(res.statusCode).toBe(400);
  });
});
