/** Behavioral bot detection vs real Postgres (CI job). KUR-110. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { BotDetectionService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('bot detection service (integration)', () => {
  let pool: pg.Pool;
  let svc: BotDetectionService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];

  async function makeUser(): Promise<string> {
    const n = userIds.length;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`bot_${n}_${suffix}@it.kurda.app`, `bot_${n}_${suffix}`],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  }

  async function setStats(userId: string, q: number, impossible: number, fast: number, rtt: number): Promise<void> {
    await pool.query(
      `INSERT INTO cheat_stats (user_id, questions_answered, correct_count, fast_count, impossible_count, rtt_anomaly_count)
       VALUES ($1,$2,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET questions_answered=$2, fast_count=$3, impossible_count=$4, rtt_anomaly_count=$5`,
      [userId, q, fast, impossible, rtt],
    );
  }

  async function setActiveHours(userId: string, hours: number): Promise<void> {
    for (let h = 0; h < hours; h++) {
      await pool.query(
        `INSERT INTO xp_ledger (user_id, source, amount, ref_id, created_at)
         VALUES ($1, 'test', 1, $2, now() - ($3 || ' hours')::interval)`,
        [userId, `act:${userId}:${h}`, String(h)],
      );
    }
  }

  async function shareDevice(userId: string, others: number): Promise<void> {
    const device = `botdev-${userId}`;
    const ins = async (uid: string) =>
      pool.query(
        `INSERT INTO risk_decisions (event, user_id, device_hash, score, band, action)
         VALUES ('signup', $1, $2, 0, 'low', 'proceed')`,
        [uid, device],
      );
    await ins(userId);
    for (let i = 0; i < others; i++) await ins(await makeUser());
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new BotDetectionService(pool);
  });
  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
  });

  it('scores an ordinary account clear (no challenge)', async () => {
    const u = await makeUser();
    await setStats(u, 100, 0, 2, 0);
    await setActiveHours(u, 6);
    const res = await svc.scoreUser(u);
    expect(res.tier).toBe('clear');
    expect(await svc.requiresChallenge(u)).toBe(false);
  });

  it('flags a scripted 24/7 farm and queues it for review', async () => {
    const u = await makeUser();
    await setStats(u, 100, 40, 60, 30);
    await setActiveHours(u, 23);
    await shareDevice(u, 9); // 10 accounts on the device
    const res = await svc.scoreUser(u);
    expect(res.tier).toBe('flagged');
    expect(res.challenge).toBe(true);
    expect(await svc.requiresChallenge(u)).toBe(true);

    const flagged = await svc.flaggedForReview();
    expect(flagged.some((f) => f.userId === u)).toBe(true);
  });

  it('confirm-and-reverse zeroes ill-gotten XP through the ledger', async () => {
    const u = await makeUser();
    await setStats(u, 100, 40, 60, 30);
    await setActiveHours(u, 23);
    await svc.scoreUser(u);
    await pool.query(`UPDATE users SET xp = 500 WHERE id = $1`, [u]);

    const mod = await makeUser();
    const reversed = await svc.confirmAndReverse(u, mod);
    expect(reversed).toBe(500);

    const after = await pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id = $1`, [u]);
    expect(after.rows[0]!.xp).toBe(0);
    const led = await pool.query<{ amount: number }>(
      `SELECT amount FROM xp_ledger WHERE user_id = $1 AND source = 'bot_reversal'`,
      [u],
    );
    expect(led.rows[0]!.amount).toBe(-500);

    // re-scoring keeps a confirmed bot confirmed
    await svc.scoreUser(u);
    const st = await pool.query<{ status: string }>(`SELECT status FROM bot_scores WHERE user_id = $1`, [u]);
    expect(st.rows[0]!.status).toBe('confirmed');
  });

  it('clears a false positive', async () => {
    const u = await makeUser();
    await setStats(u, 100, 40, 60, 30);
    await setActiveHours(u, 23);
    await svc.scoreUser(u);
    expect(await svc.requiresChallenge(u)).toBe(true);

    const mod = await makeUser();
    expect(await svc.clear(u, mod)).toBe(true);
    expect(await svc.requiresChallenge(u)).toBe(false);
  });

  it('scoreActive scores every account with enough game activity', async () => {
    const u = await makeUser();
    await setStats(u, 50, 0, 0, 0);
    const n = await svc.scoreActive();
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
