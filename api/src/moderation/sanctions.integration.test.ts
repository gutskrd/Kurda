/**
 * The sanctions service against real Postgres, where it matters that two
 * transactions meet: changes to one person's sanctions run one after the
 * other, so the enforced columns always match the sanctions in force.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SanctionsService, countModerators } from './sanctions-service.js';

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

  it('counts a suspended moderator for the two-person rule, so one cannot suspend the other to act alone', async () => {
    const mod = await user('mod1');
    // one snapshot, so moderators other suites add meanwhile do not change the count
    const db = await pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const before = await countModerators(db);
      await db.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [mod]);
      await db.query(`INSERT INTO admin_totp (user_id, secret, confirmed_at) VALUES ($1, 'x', now())`, [mod]);
      expect(await countModerators(db)).toBe(before + 1);

      // suspended for an hour by a colleague: still a moderator who must be asked
      await sanctions.apply(db, { ...base, userId: mod, kind: 'suspension', durationHours: 1, statement: 'Suspended.' });
      expect(await countModerators(db)).toBe(before + 1);
      // a permanent ban nobody else has confirmed does not take them out either
      const ban = await sanctions.apply(db, {
        ...base, userId: mod, kind: 'permanent_ban', policy: 'child_safety', statement: 'Closed.', zeroTolerance: true,
      });
      expect(await countModerators(db)).toBe(before + 1);
      // once a second admin confirms it, they are gone
      await db.query(`UPDATE sanctions SET approved_at = now() WHERE id = $1`, [ban.sanction.id]);
      expect(await countModerators(db)).toBe(before);
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
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
