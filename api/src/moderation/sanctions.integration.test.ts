/**
 * The sanctions service against real Postgres, where it matters that two
 * transactions meet: changes to one person's sanctions run one after the
 * other, so the enforced columns always match the sanctions in force.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SanctionsService } from './sanctions-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('sanctions (integration)', () => {
  let pool: pg.Pool;
  let sanctions: SanctionsService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const ids: string[] = [];

  async function user(tag: string): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, created_at)
       VALUES ($1, $2, 1990, 6, now() - interval '3 days') RETURNING id`,
      [`sn_${tag}_${suffix}@it.kurda.app`, `sn${tag}${suffix}`],
    );
    ids.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }
  const base = { policy: 'harassment' as const, createdBy: null, origin: 'automatic' as const };
  const enforced = async (id: string) =>
    (
      await pool.query<{ banned: boolean; muted: boolean }>(
        `SELECT banned_at IS NOT NULL AS banned, muted_until > now() AS muted FROM users WHERE id = $1`,
        [id],
      )
    ).rows[0]!;

  /** Run `first` in an open transaction, start `second` while it is open, then commit `first`. */
  async function overlapping(first: (c: pg.PoolClient) => Promise<unknown>, second: (c: pg.PoolClient) => Promise<unknown>): Promise<void> {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query('BEGIN');
      await first(a);
      await b.query('BEGIN');
      const racing = second(b).then(() => b.query('COMMIT'));
      // long enough for the second to reach the row the first holds
      await new Promise((r) => setTimeout(r, 150));
      await a.query('COMMIT');
      await racing;
    } catch (err) {
      await a.query('ROLLBACK').catch(() => undefined);
      await b.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      a.release();
      b.release();
    }
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    sanctions = new SanctionsService(pool, { moderatorCount: async () => 2 });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await pool.end();
  });

  it('a mute applied while a suspension is being applied does not undo the ban', async () => {
    const id = await user('race1');
    await overlapping(
      (c) => sanctions.apply(c, { ...base, userId: id, kind: 'suspension', durationHours: 24, statement: 'Suspended.' }),
      (c) => sanctions.apply(c, { ...base, userId: id, kind: 'chat_mute', durationHours: 1, statement: 'Muted.' }),
    );
    expect(await enforced(id)).toEqual({ banned: true, muted: true });
  });

  it('an unmute while a suspension is being applied does not undo the ban either', async () => {
    const id = await user('race2');
    const mute = await sanctions.apply(pool, { ...base, userId: id, kind: 'chat_mute', durationHours: 5, statement: 'Muted.' });
    await overlapping(
      (c) => sanctions.apply(c, { ...base, userId: id, kind: 'suspension', durationHours: 24, statement: 'Suspended.' }),
      (c) => sanctions.revoke(c, mute.sanction.id, null, 'lifted'),
    );
    expect(await enforced(id)).toEqual({ banned: true, muted: null });
  });
});
