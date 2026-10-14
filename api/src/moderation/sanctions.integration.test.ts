/**
 * The sanctions service against real Postgres, where it matters that two
 * transactions meet: changes to one person's sanctions run one after the
 * other, so the enforced columns always match the sanctions in force.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { isBannedEmail } from './ban-registry.js';
import { emailRegistryHash } from './pseudonym.js';
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

  it('puts a permanent ban carried over from the old columns on the banned-address registry', async () => {
    const id = await user('legacy1');
    const email = `sn_legacy1_${suffix}@it.kurda.app`;
    // as the migration wrote it: a sanction, and nothing on the registry
    await pool.query(
      `INSERT INTO sanctions (user_id, kind, policy, statement, starts_at, origin, meta)
       VALUES ($1, 'permanent_ban', 'other', 'Closed.', now() - interval '1 day', 'moderator', '{"legacy": true}'::jsonb)`,
      [id],
    );
    expect(await isBannedEmail(pool, email.replace('@', '+again@'))).toBe(false);
    expect(await sanctions.backfillBanRegistry()).toBeGreaterThanOrEqual(1);
    expect(await isBannedEmail(pool, email.replace('@', '+again@'))).toBe(true);
    // and once is enough
    const again = await pool.query(`SELECT count(*)::int AS n FROM ban_registry WHERE value_hash = $1`, [emailRegistryHash(email)]);
    await sanctions.backfillBanRegistry();
    expect((await pool.query(`SELECT count(*)::int AS n FROM ban_registry WHERE value_hash = $1`, [emailRegistryHash(email)])).rows).toEqual(again.rows);
  });

  it('keeps an address on the registry while another banned account shares it', async () => {
    const plain = await user('twin');
    const tagged = await user('twin2');
    const address = `sn_twin_${suffix}@it.kurda.app`;
    // the second account signed up with a +tag of the first one's address
    await pool.query(`UPDATE users SET email = $2 WHERE id = $1`, [tagged, address.replace('@', '+2@')]);
    const ban = (userId: string) =>
      sanctions.apply(pool, { ...base, userId, kind: 'permanent_ban', statement: 'Closed.', singleApproved: true });
    await ban(plain);
    const second = await ban(tagged);
    expect(await isBannedEmail(pool, address)).toBe(true);

    // lifting one ban leaves the address barred for the other
    await sanctions.unban(ids[0]!, plain, 'mistaken identity');
    expect(await isBannedEmail(pool, address)).toBe(true);
    const entry = await pool.query<{ sanction_id: string }>(`SELECT sanction_id FROM ban_registry WHERE value_hash = $1`, [emailRegistryHash(address)]);
    expect(entry.rows[0]!.sanction_id).toBe(second.sanction.id);
    await sanctions.unban(ids[0]!, tagged, 'mistaken identity');
    expect(await isBannedEmail(pool, address)).toBe(false);
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
