/** Groups / clubs (KUR-084) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GroupService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('groups (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `grp_${tag}_${suffix}@it.kurda.app`,
        username: `grp_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
    id.a = await register('a', '10.84.1.1');
    id.b = await register('b', '10.84.2.1');
    id.c = await register('c', '10.84.3.1');
    id.d = await register('d', '10.84.4.1');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('create makes the creator owner; open group is joinable', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Club ${suffix}`, privacy: 'open' });
    await groups.join(id.b!, gid);
    const g = await groups.get(gid, id.a!);
    expect(g.memberCount).toBe(2);
    expect(g.members.find((m) => m.userId === id.a)!.role).toBe('owner');
    expect(g.myRole).toBe('owner');
  });

  it('invite-only groups reject joins but accept staff invites', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Secret ${suffix}`, privacy: 'invite' });
    await expect(groups.join(id.b!, gid)).rejects.toThrow(/invite-only/i);
    await groups.invite(id.a!, gid, id.b!);
    expect((await groups.get(gid, id.a!)).memberCount).toBe(2);
  });

  it('roles: owner promotes/removes; a moderator cannot promote', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Roles ${suffix}`, privacy: 'open' });
    await groups.join(id.b!, gid);
    await groups.join(id.c!, gid);

    await groups.setRole(id.a!, gid, id.b!, 'moderator');
    // a moderator can't grant roles
    await expect(groups.setRole(id.b!, gid, id.c!, 'moderator')).rejects.toThrow(/not allowed/i);
    // but can remove a plain member
    await groups.removeMember(id.b!, gid, id.c!);
    // …and cannot remove the owner
    await expect(groups.removeMember(id.b!, gid, id.a!)).rejects.toThrow(/not allowed/i);
    expect((await groups.get(gid, id.a!)).memberCount).toBe(2);
  });

  it('ownership transfer swaps roles; the owner cannot just leave', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Transfer ${suffix}`, privacy: 'open' });
    await groups.join(id.b!, gid);
    await expect(groups.leave(id.a!, gid)).rejects.toThrow(/transfer ownership/i);

    await groups.transferOwnership(id.a!, gid, id.b!);
    const g = await groups.get(gid, id.a!);
    expect(g.members.find((m) => m.userId === id.b)!.role).toBe('owner');
    expect(g.members.find((m) => m.userId === id.a)!.role).toBe('moderator');
    expect(g.ownerId).toBe(id.b);
  });

  it('reconcile promotes the oldest moderator when the owner is gone', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Orphan ${suffix}`, privacy: 'open' });
    await groups.join(id.c!, gid);
    await groups.setRole(id.a!, gid, id.c!, 'moderator');
    // simulate the owner's account deletion: membership gone, owner_id nulled
    await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [gid, id.a!]);
    await pool.query(`UPDATE groups SET owner_id = NULL WHERE id = $1`, [gid]);

    expect(await groups.reconcileOwnerless()).toBeGreaterThanOrEqual(1);
    const g = await groups.get(gid, id.c!);
    expect(g.ownerId).toBe(id.c);
    expect(g.members.find((m) => m.userId === id.c)!.role).toBe('owner');
  });

  it('computes group weekly XP for the leaderboard hook', async () => {
    const { id: gid } = await groups.create(id.d!, { name: `XP ${suffix}`, privacy: 'open' });
    await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1,'grp_test',250,$2)`, [id.d!, `grp-${suffix}`]);
    expect(await groups.weeklyXp(gid)).toBeGreaterThanOrEqual(250);
  });
});
