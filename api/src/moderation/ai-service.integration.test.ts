/** AI-assisted moderation orchestration vs real Postgres (CI job). KUR-293. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { AiModerationService } from './ai-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('ai moderation service (integration)', () => {
  let pool: pg.Pool;
  let svc: AiModerationService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];

  async function makeUser(): Promise<string> {
    const n = userIds.length;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`mod_${n}_${suffix}@it.kurda.app`, `mod_${n}_${suffix}`],
    );
    const id = res.rows[0]!.id;
    userIds.push(id);
    return id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new AiModerationService(pool);
  });
  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
  });

  it('allows benign text without creating a flag', async () => {
    const u = await makeUser();
    const out = await svc.moderate({ surface: 'chat', text: 'hey, want to study tonight?', authorId: u, contentType: 'dm' });
    expect(out.action).toBe('allow');
    expect(out.blocked).toBe(false);
    expect(out.flagId).toBeNull();

    const rows = await pool.query(`SELECT 1 FROM moderation_flags WHERE author_id = $1`, [u]);
    expect(rows.rowCount).toBe(0);
  });

  it('blocks high-confidence spam and records a reversible flag', async () => {
    const u = await makeUser();
    const out = await svc.moderate({
      surface: 'chat',
      text: 'FREE MONEY crypto giveaway click here http://a.io http://b.io http://c.io',
      authorId: u,
      contentType: 'dm',
    });
    expect(out.blocked).toBe(true);
    expect(out.topCategory).toBe('spam');
    expect(out.flagId).not.toBeNull();

    const row = await pool.query<{ action: string; status: string; model_version: string }>(
      `SELECT action, status, model_version FROM moderation_flags WHERE id = $1`,
      [out.flagId],
    );
    expect(['auto_hide', 'auto_block']).toContain(row.rows[0]!.action);
    expect(row.rows[0]!.status).toBe('pending');
    expect(row.rows[0]!.model_version).toBe('heuristic-spam-v1');
  });

  it('surfaces pending flags and reverses a false positive', async () => {
    const u = await makeUser();
    const out = await svc.moderate({
      surface: 'profile',
      text: 'earn $$$ work from home http://scam.xyz http://scam2.xyz',
      authorId: u,
      contentType: 'profile',
    });
    expect(out.flagId).not.toBeNull();

    const pending = await svc.pending();
    expect(pending.some((f) => f.id === out.flagId)).toBe(true);

    const mod = await makeUser();
    const ok = await svc.resolve(out.flagId!, mod, 'reversed');
    expect(ok).toBe(true);

    // no longer pending; resolving again is a no-op
    const after = await svc.pending();
    expect(after.some((f) => f.id === out.flagId)).toBe(false);
    expect(await svc.resolve(out.flagId!, mod, 'reversed')).toBe(false);
  });
});
