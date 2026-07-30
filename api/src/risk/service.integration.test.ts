/** Signup & login risk scoring against real Postgres + Redis (CI job). KUR-296. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { RiskService } from './service.js';
import { StaticIpReputationProvider } from './ip-reputation.js';
import { MAX_ACCOUNTS_PER_DEVICE } from './score.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL)('risk service (integration)', () => {
  let pool: pg.Pool;
  let redis: Redis | undefined;
  const suffix = Math.random().toString(36).slice(2, 8);
  const decisionIds: string[] = [];
  const userIds: string[] = [];

  const track = async (p: Promise<import('./service.js').AssessResult>) => {
    const r = await p;
    decisionIds.push(r.decisionId);
    return r;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);
  });

  afterAll(async () => {
    if (decisionIds.length) await pool.query(`DELETE FROM risk_decisions WHERE id = ANY($1)`, [decisionIds]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    if (redis) await redis.quit();
    await pool.end();
  });

  it('logs a low-risk signup as proceed with its signals', async () => {
    const svc = new RiskService(pool, { redis });
    const { assessment, signals } = await track(
      svc.assessSignup({ email: `ok_${suffix}@gmail.com`, ip: `10.20.0.1`, deviceId: `devA_${suffix}` }),
    );
    expect(assessment.band).toBe('low');
    expect(assessment.action).toBe('proceed');
    expect(assessment.hardBlock).toBe(false);
    expect(signals.disposableEmail).toBe(false);

    const row = await pool.query<{ action: string; signals: unknown }>(
      `SELECT action, signals FROM risk_decisions WHERE event='signup' AND device_hash IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
    );
    expect(row.rows[0]!.action).toBe('proceed');
    expect(row.rows[0]!.signals).toBeTruthy();
  });

  it('hard-blocks past the per-device account cap', async () => {
    const svc = new RiskService(pool, { redis });
    const device = `capdev_${suffix}`;
    let last;
    for (let i = 0; i < MAX_ACCOUNTS_PER_DEVICE + 1; i++) {
      last = await track(
        svc.assessSignup({ email: `c${i}_${suffix}@gmail.com`, ip: `10.20.1.${i}`, deviceId: device }),
      );
    }
    // the (cap+1)-th signup from the same device is blocked regardless of score
    expect(last!.assessment.hardBlock).toBe(true);
    expect(last!.assessment.action).toBe('verify_or_block');
    expect(last!.signals.accountsFromDeviceRecently).toBe(MAX_ACCOUNTS_PER_DEVICE + 1);
  });

  it('softens IP volume on a shared network (classroom not over-blocked)', async () => {
    const shared = new RiskService(pool, {
      redis,
      ipReputation: new StaticIpReputationProvider({ reputation: 'clean', sharedNetwork: true }),
    });
    const ip = `10.20.2.1`;
    let last;
    for (let i = 0; i < 12; i++) {
      last = await track(
        shared.assessSignup({ email: `s${i}_${suffix}@gmail.com`, ip, deviceId: `shared${i}_${suffix}` }),
      );
    }
    // 12 accounts from one shared IP: under the 50 shared cap, and IP volume is
    // discounted, so it never hard-blocks on IP alone
    expect(last!.signals.sharedNetwork).toBe(true);
    expect(last!.assessment.hardBlock).toBe(false);
  });

  it('treats a device with a verified account as known-good (score drops)', async () => {
    const svc = new RiskService(pool, { redis });
    const device = `gooddev_${suffix}`;

    // first signup from the device, attached to a verified user
    const first = await track(svc.assessSignup({ email: `g_${suffix}@gmail.com`, ip: `10.20.3.1`, deviceId: device }));
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, email_verified_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`good_${suffix}@it.kurda.app`, `good_${suffix}`],
    );
    userIds.push(u.rows[0]!.id);
    await svc.attachUser(first.decisionId, u.rows[0]!.id);

    const again = await track(svc.assessLogin({ email: `good_${suffix}@it.kurda.app`, ip: `10.20.3.9`, deviceId: device }));
    expect(again.signals.deviceKnownGood).toBe(true);
    expect(again.assessment.band).toBe('low');
  });

  it('steps up (never hard-blocks) on a malicious IP alone', async () => {
    const badIp = new RiskService(pool, {
      redis,
      ipReputation: new StaticIpReputationProvider({ reputation: 'malicious', sharedNetwork: false }),
    });
    const { assessment, signals } = await track(
      badIp.assessLogin({ email: `x_${suffix}@gmail.com`, ip: `10.20.4.1`, deviceId: `mdev_${suffix}` }),
    );
    expect(signals.ipReputation).toBe('malicious');
    expect(assessment.band).toBe('medium'); // IP alone → solvable step-up, not a block
    expect(assessment.action).toBe('step_up');
  });

  it('escalates to high (verify_or_block) when signals compound', async () => {
    const badIp = new RiskService(pool, {
      redis,
      ipReputation: new StaticIpReputationProvider({ reputation: 'malicious', sharedNetwork: false }),
    });
    // malicious IP (45) + disposable email (25) = 70 → high
    const { assessment } = await track(
      badIp.assessSignup({ email: `x_${suffix}@mailinator.com`, ip: `10.20.6.1`, deviceId: `hdev_${suffix}` }),
    );
    expect(assessment.band).toBe('high');
    expect(assessment.action).toBe('verify_or_block');
  });

  it('degrades gracefully when the reputation provider throws', async () => {
    const flaky = new RiskService(pool, {
      redis,
      ipReputation: { lookup: async () => { throw new Error('provider down'); } },
    });
    const { assessment, signals } = await track(
      flaky.assessSignup({ email: `f_${suffix}@gmail.com`, ip: `10.20.5.1`, deviceId: `fdev_${suffix}` }),
    );
    expect(signals.ipReputation).toBe('clean'); // neutral fallback, no hard block
    expect(assessment.action).toBe('proceed');
  });
});
