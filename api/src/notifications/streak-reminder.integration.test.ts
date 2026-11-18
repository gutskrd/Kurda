/** Personalized streak reminders against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { StreakReminderService, type ReminderEnqueuer } from './streak-reminder-service.js';
import type { Notification } from '../push/service.js';
import { bornYearsAgo } from '../test/age.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('streak reminders (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const sent: { userId: string; notification: Notification }[] = [];
  let batches = 0;
  const enqueuer: ReminderEnqueuer = {
    enqueueAll: async (items) => {
      batches += 1;
      sent.push(...items);
    },
  };
  let service: StreakReminderService;
  let atRisk = '';
  let practiced = '';
  let minor = '';
  let minorOptedIn = '';

  async function register(name: string, ip: string, ageYears?: number): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(ageYears ?? 30),
      },
      remoteAddress: ip,
    });
    return res.json().user.id;
  }

  // Seed a user in UTC with a live streak and XP history at 08:00 UTC.
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

  // A later day's run needs the learners active the day before, or their streaks have ended.
  async function practisedOn(day: string, ...userIds: string[]): Promise<void> {
    await pool.query(`UPDATE user_streaks SET last_active_on = $1 WHERE user_id = ANY($2::uuid[])`, [day, userIds]);
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
    minor = await register('streakM', '10.96.0.3', 15);
    minorOptedIn = await register('streakN', '10.96.0.4', 16);
    await seed(minor, 5, '2026-06-14');
    await seed(minorOptedIn, 5, '2026-06-14');
    // a minor who chose to have them
    await pool.query(`INSERT INTO notification_prefs (user_id, streak) VALUES ($1, true)`, [minorOptedIn]);
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

  it('writes the reminder in the language the account chose', async () => {
    await pool.query(`UPDATE users SET locale = 'de' WHERE id = $1`, [minorOptedIn]);
    sent.length = 0;
    // a day of its own, so nothing has been sent yet
    await practisedOn('2026-06-15', atRisk, minorOptedIn);
    const before = batches;
    await service.runHourly(new Date('2026-06-16T08:30:00Z'));
    // both reminders in one queueing
    expect(batches - before).toBe(1);
    const german = sent.find((s) => s.userId === minorOptedIn);
    expect(german?.notification.title).toBe('Ein paar Minuten Kurdisch?');
    expect(sent.find((s) => s.userId === atRisk)?.notification.title).toBe('A few minutes of Kurdish?');
    await pool.query(`UPDATE users SET locale = 'en' WHERE id = $1`, [minorOptedIn]);
  });

  it('never notifies a user who already practiced today', async () => {
    sent.length = 0;
    await service.runHourly(new Date('2026-06-15T08:30:00Z'));
    expect(sent.some((s) => s.userId === practiced)).toBe(false);
  });

  it('sends a minor no streak reminders unless they turned them on', async () => {
    sent.length = 0;
    // a day of its own: the first test already sent the 15th's reminders
    await practisedOn('2026-06-16', minor, minorOptedIn);
    await service.runHourly(new Date('2026-06-17T08:30:00Z'));
    expect(sent.some((s) => s.userId === minor)).toBe(false);
    expect(sent.some((s) => s.userId === minorOptedIn)).toBe(true);
  });

  it('never queues a reminder for anyone who turned them off', async () => {
    await pool.query(
      `INSERT INTO notification_prefs (user_id, streak) VALUES ($1, false)
       ON CONFLICT (user_id) DO UPDATE SET streak = false`,
      [atRisk],
    );
    sent.length = 0;
    await practisedOn('2026-06-17', atRisk);
    await service.runHourly(new Date('2026-06-18T08:30:00Z'));
    expect(sent.some((s) => s.userId === atRisk)).toBe(false);
    await pool.query(`DELETE FROM notification_prefs WHERE user_id = $1`, [atRisk]);
  });

  it('sends nothing to an account waiting to be deleted, and sends again once the deletion is called off', async () => {
    await pool.query(`UPDATE users SET deletion_requested_at = now() WHERE id = $1`, [atRisk]);
    sent.length = 0;
    await practisedOn('2026-06-18', atRisk);
    await service.runHourly(new Date('2026-06-19T08:30:00Z'));
    expect(sent.some((s) => s.userId === atRisk)).toBe(false);
    // signed in again: the deletion is off, and the reminders with it
    await pool.query(`UPDATE users SET deletion_requested_at = NULL WHERE id = $1`, [atRisk]);
    await practisedOn('2026-06-19', atRisk);
    await service.runHourly(new Date('2026-06-20T08:30:00Z'));
    expect(sent.some((s) => s.userId === atRisk)).toBe(true);
  });

  /* One statement reads every learner's day, so a zone Postgres does not know must not fail the whole run. */
  it('reads a zone the database does not know as UTC, and still reminds everyone else', async () => {
    const odd = await register('streakZ', '10.96.0.5');
    await seed(odd, 5, '2026-06-20');
    await pool.query(`UPDATE users SET timezone = 'BET' WHERE id = $1`, [odd]);
    sent.length = 0;
    await practisedOn('2026-06-20', atRisk);
    await service.runHourly(new Date('2026-06-21T08:30:00Z'));
    expect(sent.some((s) => s.userId === odd)).toBe(true);
    expect(sent.some((s) => s.userId === atRisk)).toBe(true);
  });

  it('reminds nobody of a streak that has already ended, but does while a freeze still holds it', async () => {
    const lapsed = await register('streakL', '10.96.0.7');
    const frozen = await register('streakF', '10.96.0.8');
    await seed(lapsed, 10, '2026-06-10'); // four days missed, no freeze: the run ended, though nobody has looked since
    await seed(frozen, 10, '2026-06-13'); // one day missed, covered by the freeze it holds
    await pool.query(`UPDATE user_streaks SET freezes = 1 WHERE user_id = $1`, [frozen]);
    await service.runHourly(new Date('2026-06-15T08:30:00Z'));
    expect(sent.filter((s) => s.userId === lapsed)).toHaveLength(0);
    expect(sent.filter((s) => s.userId === frozen)).toHaveLength(1);
  });

  it('does not fire the primary reminder outside the practice hour', async () => {
    sent.length = 0;
    await service.runHourly(new Date('2026-06-15T15:30:00Z')); // local hour 15 ≠ 8
    expect(sent.some((s) => s.userId === atRisk)).toBe(false);
  });
});
