/** Trust levels + velocity caps + spam auto-moderation vs real Postgres+Redis. KUR-295. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { TrustService } from './service.js';
import { VELOCITY_CAPS } from './levels.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('trust service (integration)', () => {
  let pool: pg.Pool;
  let redis: Redis;
  let svc: TrustService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];

  const DAY = 24 * 60 * 60 * 1000;

  async function makeUser(opts: { verified?: boolean; ageMs?: number } = {}): Promise<string> {
    const n = userIds.length;
    const created = new Date(Date.now() - (opts.ageMs ?? 0));
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, created_at, email_verified_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`trust_${n}_${suffix}@it.kurda.app`, `trust_${n}_${suffix}`, created, opts.verified ? created : null],
    );
    const id = res.rows[0]!.id;
    userIds.push(id);
    return id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    redis = new Redis(REDIS_URL!);
    svc = new TrustService(pool, { redis });
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await redis.quit();
    await pool.end();
  });

  it('computes trust level from age + verification + violations', async () => {
    const fresh = await makeUser({ ageMs: 0, verified: false });
    const basic = await makeUser({ ageMs: 2 * 60 * 60 * 1000, verified: true });
    const established = await makeUser({ ageMs: 8 * DAY, verified: true });

    expect(await svc.getLevel(fresh)).toBe('new');
    expect(await svc.getLevel(basic)).toBe('basic');
    expect(await svc.getLevel(established)).toBe('established');

    // a confirmed violation holds an otherwise-established account at `new`
    await pool.query(
      `INSERT INTO admin_actions (target_user_id, admin_id, action, reason, meta)
       VALUES ($1, NULL, 'mute', 'test', '{}'::jsonb)`,
      [established],
    );
    expect(await svc.getLevel(established)).toBe('new');
  });

  it('enforces the per-level velocity cap (new accounts throttled)', async () => {
    const u = await makeUser({ ageMs: 0, verified: false }); // level 'new'
    expect(VELOCITY_CAPS.new.group_create).toBe(1);

    const first = await svc.checkAction(u, 'group_create');
    expect(first.allowed).toBe(true);
    expect(first.level).toBe('new');
    await svc.recordAction(u, 'group_create');

    const second = await svc.checkAction(u, 'group_create');
    expect(second.allowed).toBe(false); // cap of 1 reached
    expect(second.remaining).toBe(0);
  });

  it('does not throttle an established account at the same volume', async () => {
    const u = await makeUser({ ageMs: 8 * DAY, verified: true }); // 'established', cap 20
    for (let i = 0; i < 5; i++) await svc.recordAction(u, 'group_create');
    const check = await svc.checkAction(u, 'group_create');
    expect(check.allowed).toBe(true);
    expect(check.level).toBe('established');
  });

  it('auto-mutes then auto-suspends on repeated identical content', async () => {
    const u = await makeUser({ ageMs: 0, verified: false });
    const spam = 'buy cheap followers now!!!';

    const outcomes = [];
    for (let i = 0; i < 8; i++) outcomes.push(await svc.assessContent(u, spam));

    // 5th identical (REPEAT_MUTE) → mute; 8th (REPEAT_SUSPEND) → suspend
    expect(outcomes[4]!.action).toBe('mute');
    expect(outcomes[4]!.enforced).toBe(true);
    expect(outcomes[7]!.action).toBe('suspend');

    const row = await pool.query<{ muted_until: Date | null; banned_until: Date | null; token_version: number }>(
      `SELECT muted_until, banned_until, token_version FROM users WHERE id = $1`,
      [u],
    );
    expect(row.rows[0]!.muted_until).not.toBeNull();
    expect(row.rows[0]!.banned_until).not.toBeNull(); // suspended
    expect(row.rows[0]!.token_version).toBeGreaterThan(0); // sessions revoked

    const actions = await pool.query<{ action: string; admin_id: string | null }>(
      `SELECT action, admin_id FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at`,
      [u],
    );
    const names = actions.rows.map((r) => r.action);
    expect(names).toContain('auto_mute');
    expect(names).toContain('auto_suspend');
    // system actions carry no acting admin
    expect(actions.rows.every((r) => r.admin_id === null)).toBe(true);
  });

  it('leaves distinct messages alone (no false positive)', async () => {
    const u = await makeUser({ ageMs: 0, verified: false });
    const r1 = await svc.assessContent(u, `hello there ${suffix}`);
    const r2 = await svc.assessContent(u, `how are you ${suffix}`);
    expect(r1.action).toBe('allow');
    expect(r2.action).toBe('allow');
    expect(r2.enforced).toBe(false);
  });
});
