/**
 * Migration 1751000420000 against real Postgres: a new group is private from
 * the start, and in the groups that were open the accounts not known to be an
 * adult's leave and a minor's messages go out of sight, so that nobody is
 * handed to a room of strangers. Everything it does is written down, and down
 * puts every row back where it was. Run down and up through node-pg-migrate itself, as
 * `migrate down` and `migrate up` would.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { GdprService } from '../gdpr/service.js';
import { deleteUsers, rankedUser } from '../test/ranks.js';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const FILE = '1751000420000_private-groups';

async function migrate(direction: 'up' | 'down'): Promise<void> {
  await runner({
    databaseUrl: DATABASE_URL!,
    dir: MIGRATIONS,
    migrationsTable: 'pgmigrations',
    direction,
    file: FILE,
    // later migrations stay applied while this one goes down and up
    checkOrder: false,
    log: () => undefined,
  });
}

describe.skipIf(!DATABASE_URL)('the private groups migration (integration)', () => {
  let pool: pg.Pool;
  const userIds: string[] = [];
  const groupIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  const thisYear = new Date().getUTCFullYear();

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    // whatever happened above, the schema is left migrated
    const applied = await pool.query(`SELECT to_regclass('open_group_closures') IS NOT NULL AS there`);
    if (!applied.rows[0].there) await migrate('up');
    if (groupIds.length) await pool.query(`DELETE FROM groups WHERE id = ANY($1::uuid[])`, [groupIds]);
    await deleteUsers(pool, userIds);
    await pool.end();
  });

  const user = async (tag: string, birthYear: number | null): Promise<string> => {
    const id = await rankedUser(pool, `pg_${tag}_${suffix}`, { birthYear });
    userIds.push(id);
    return id;
  };

  /** A group as it stood before the migration, with its members in the order given (the first one its owner). */
  const group = async (privacy: 'open' | 'invite', members: Array<[string, 'owner' | 'moderator' | 'member']>): Promise<string> => {
    const owner = members.find(([, role]) => role === 'owner')![0];
    const g = await pool.query<{ id: string }>(`INSERT INTO groups (name, privacy, owner_id) VALUES ($1, $2, $3) RETURNING id`, [`pg ${suffix}`, privacy, owner]);
    const id = g.rows[0]!.id;
    groupIds.push(id);
    let minutes = members.length;
    for (const [userId, role] of members) {
      await pool.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, $3, now() - make_interval(mins => $4))`, [id, userId, role, minutes]);
      minutes -= 1;
    }
    return id;
  };

  const say = async (groupId: string, senderId: string, body: string): Promise<string> => {
    const m = await pool.query<{ id: string }>(`INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id`, [groupId, senderId, body]);
    return m.rows[0]!.id;
  };

  const roster = async (groupId: string): Promise<Record<string, string>> => {
    const r = await pool.query<{ user_id: string; role: string }>(`SELECT user_id, role FROM group_members WHERE group_id = $1`, [groupId]);
    return Object.fromEntries(r.rows.map((row) => [row.user_id, row.role]));
  };

  const groupRow = async (groupId: string): Promise<{ privacy: string; owner_id: string | null; archived: boolean }> => {
    const r = await pool.query<{ privacy: string; owner_id: string | null; archived: boolean }>(
      `SELECT privacy, owner_id, archived_at IS NOT NULL AS archived FROM groups WHERE id = $1`,
      [groupId],
    );
    return r.rows[0]!;
  };

  const inSight = async (messageId: string): Promise<boolean> => {
    const r = await pool.query<{ shown: boolean }>(`SELECT deleted_at IS NULL AS shown FROM group_messages WHERE id = $1`, [messageId]);
    return r.rows[0]!.shown;
  };

  it('takes the accounts not known to be adults out of the open groups, leaves the private ones alone, and puts all of it back on the way down', async () => {
    const adult = await user('adult', 1990);
    const friend = await user('friend', 1988);
    const minor = await user('minor', thisYear - 15);
    const unknown = await user('unknown', null);
    const mod = await user('mod', 1985);
    const loner = await user('loner', null);

    await migrate('down');

    // an open room of strangers: two adults, a minor and an account whose age was never recorded
    const room = await group('open', [
      [adult, 'owner'],
      [friend, 'member'],
      [minor, 'member'],
      [unknown, 'member'],
    ]);
    const kept = await say(room, adult, 'silav');
    const minors = await say(room, minor, 'ez li vir im');
    // an open group whose owner's age is unknown, with a moderator to take it on
    const handedOn = await group('open', [
      [unknown, 'owner'],
      [friend, 'member'],
      [mod, 'moderator'],
    ]);
    // one with nobody else in it
    const empty = await group('open', [[loner, 'owner']]);
    // and a group that was private already: a friend put the minor there
    const circle = await group('invite', [
      [adult, 'owner'],
      [minor, 'member'],
      [unknown, 'member'],
    ]);
    const amongFriends = await say(circle, minor, 'roj baş');

    await migrate('up');

    // the groups that were open go on saying so, which is all the column is for now; a new group is private from the start
    for (const id of [room, handedOn, empty]) expect((await groupRow(id)).privacy).toBe('open');
    expect((await groupRow(circle)).privacy).toBe('invite');
    const fresh = await pool.query<{ id: string; privacy: string }>(`INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING id, privacy`, [`pg new ${suffix}`, adult]);
    groupIds.push(fresh.rows[0]!.id);
    expect(fresh.rows[0]!.privacy).toBe('invite');

    // the room keeps its adults; the two who could not read it have left, and the minor's words are out of sight
    expect(await roster(room)).toEqual({ [adult]: 'owner', [friend]: 'member' });
    expect(await inSight(kept)).toBe(true);
    expect(await inSight(minors)).toBe(false);
    // the group whose owner left goes to its moderator, before a member who joined earlier
    expect(await roster(handedOn)).toEqual({ [friend]: 'member', [mod]: 'owner' });
    expect((await groupRow(handedOn)).owner_id).toBe(mod);
    // the one left with nobody is archived
    expect(await roster(empty)).toEqual({});
    expect(await groupRow(empty)).toMatchObject({ owner_id: null, archived: true });
    // a group that was already private is as it was
    expect(await roster(circle)).toEqual({ [adult]: 'owner', [minor]: 'member', [unknown]: 'member' });
    expect(await inSight(amongFriends)).toBe(true);

    // all of it is written down
    const noted = await pool.query<{ what: string; n: number }>(
      `SELECT what, count(*)::int AS n FROM open_group_closures WHERE group_id = ANY($1::uuid[]) GROUP BY what`,
      [[room, handedOn, empty, circle]],
    );
    expect(Object.fromEntries(noted.rows.map((r) => [r.what, r.n]))).toEqual({ left: 4, promoted: 1, archived: 1, message: 1 });

    await migrate('down');

    // and back exactly: who was in, in which role, who owned what, what could be read
    expect(await groupRow(room)).toEqual({ privacy: 'open', owner_id: adult, archived: false });
    expect(await roster(room)).toEqual({ [adult]: 'owner', [friend]: 'member', [minor]: 'member', [unknown]: 'member' });
    expect(await inSight(minors)).toBe(true);
    expect(await groupRow(handedOn)).toEqual({ privacy: 'open', owner_id: unknown, archived: false });
    expect(await roster(handedOn)).toEqual({ [unknown]: 'owner', [friend]: 'member', [mod]: 'moderator' });
    expect(await groupRow(empty)).toEqual({ privacy: 'open', owner_id: loner, archived: false });
    expect(await roster(empty)).toEqual({ [loner]: 'owner' });
    expect((await groupRow(circle)).privacy).toBe('invite');
    expect(await roster(circle)).toEqual({ [adult]: 'owner', [minor]: 'member', [unknown]: 'member' });

    await migrate('up');
  });

  it('keeps nothing about an account that is closed afterwards', async () => {
    const adult = await user('keeper', 1990);
    const leaver = await user('leaver', null);
    await migrate('down');
    const room = await group('open', [
      [adult, 'owner'],
      [leaver, 'member'],
    ]);
    await migrate('up');
    const before = await pool.query(`SELECT 1 FROM open_group_closures WHERE user_id = $1`, [leaver]);
    expect(before.rowCount).toBe(1);
    // closed as an account is: its row stays, anonymized, so nothing goes by itself
    await new GdprService(pool).closeNow(leaver, 'under_minimum_age');
    const after = await pool.query(`SELECT 1 FROM open_group_closures WHERE user_id = $1`, [leaver]);
    expect(after.rowCount).toBe(0);
    expect(await roster(room)).toEqual({ [adult]: 'owner' });
  });
});
