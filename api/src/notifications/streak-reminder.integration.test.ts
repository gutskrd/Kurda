/** Personalized streak reminders (KUR-096) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { StreakReminderService, type ReminderEnqueuer } from './streak-reminder-service.js';
import type { Notification } from '../push/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('streak reminders (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const sent: { userId: string; notification: Notification }[] = [];
  const enqueuer: ReminderEnqueuer = {
    enqueue: async (userId, notification) => {
      sent.push({ userId, notification });
    },
  };
  let service: StreakReminderService;
  let atRisk = '';
  let practiced = '';

  async function register(name: string, ip: string): Promise<string> {
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
    return res.json().user.id;
  }

  // seed a user with tz=UTC, a live streak, and XP history at 08:00 UTC
  async function seed(userId: string, streak: number, lastActiveOn: string): Promise<void> {
    await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [userId]);
    await pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, last_active_on)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET current_streak = EXCLUDED.current_streak, last_active_on = EXCLUDED.last_active_on`,
      [userId, streak, lastActiveOn],
    );
    await pool.query(
      `INSERT INTO xp_ledger (user_id, source, amount, created_at)
       VALUES ($1, 'lesson', 10, '2026-06-10T08:00:00Z'), ($1, 'lesson', 10, '2026-06-11T08:00:00Z')`,
      [userId],
    );
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    service = new StreakReminderService(pool, enqueuer);
    atRisk = await register('streakA', '10.96.0.1');
    practiced = await register('streakB', '10.96.0.2');
    await seed(atRisk, 5, '2026-06-14'); // streak alive, not practiced on the 15th
    await seed(practiced, 5, '2026-06-15'); // already practiced on the 15th
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

  it('sends the primary reminder at the historical hour, once (idempotent)', async () => {
    const now = new Date('2026-06-15T08:30:00Z'); // local hour 8 = historical hour
    const first = await service.runHourly(now);
    const mine = sent.filter((s) => s.userId === atRisk);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.notification.category).toBe('streak');
    expect(first).toBeGreaterThanOrEqual(1);

    // running again in the same hour/day does not re-send (send-log gate)
    sent.length = 0;
    await service.runHourly(now);
    expect(sent.filter((s) => s.userId === atRisk)).toHaveLength(0);
  });

  it('never notifies a user who already practiced today', async () => {
    sent.length = 0;
    await service.runHourly(new Date('2026-06-15T08:30:00Z'));
    expect(sent.some((s) => s.userId === practiced)).toBe(false);
  });

  it('does not fire the primary reminder outside the practice hour', async () => {
    sent.length = 0;
    await service.runHourly(new Date('2026-06-15T15:30:00Z')); // local hour 15 ≠ 8
    expect(sent.some((s) => s.userId === atRisk)).toBe(false);
  });
});
