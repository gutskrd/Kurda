/** Bootstrap admin grants against real Postgres — the binding is the point. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { BOOTSTRAP_ADMIN_ROLES, grantBootstrapAdmins, parseAdminEmails } from './bootstrap-admins.js';

const DATABASE_URL = process.env.DATABASE_URL;

const silent = { info: () => undefined, warn: () => undefined };

describe('parseAdminEmails', () => {
  it('trims, lowercases, drops blanks and de-duplicates', () => {
    expect(parseAdminEmails(' A@x.com , b@x.com ,, A@X.COM ')).toEqual(['a@x.com', 'b@x.com']);
    expect(parseAdminEmails('')).toEqual([]);
  });
});

describe.skipIf(!DATABASE_URL)('grantBootstrapAdmins (integration)', () => {
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const ids: string[] = [];

  const emailFor = (name: string): string => `boot_${name}_${suffix}@it.kurda.app`;

  async function makeUser(name: string, opts: { verified: boolean; banned?: boolean } = { verified: true }): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, email_verified_at, banned_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        emailFor(name),
        `boot_${name}_${suffix}`.slice(0, 30),
        opts.verified ? new Date() : null,
        opts.banned ? new Date() : null,
      ],
    );
    ids.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  }

  const rolesOf = async (id: string): Promise<string[]> =>
    (await pool.query<{ roles: string[] }>(`SELECT roles FROM users WHERE id = $1`, [id])).rows[0]!.roles;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (ids.length) {
      await pool.query(`DELETE FROM admin_audit_log WHERE target_id = ANY($1)`, [ids]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    }
    await pool.end();
  });

  it('grants both roles to a confirmed address', async () => {
    const id = await makeUser('ok');
    const res = await grantBootstrapAdmins(pool, emailFor('ok'), silent);
    expect(res.granted).toEqual([emailFor('ok')]);
    expect(await rolesOf(id)).toEqual(expect.arrayContaining([...BOOTSTRAP_ADMIN_ROLES]));
  });

  it('refuses an account that has NOT confirmed the address', async () => {
    const id = await makeUser('unverified', { verified: false });
    const res = await grantBootstrapAdmins(pool, emailFor('unverified'), silent);
    expect(res.unverified).toEqual([emailFor('unverified')]);
    expect(res.granted).toEqual([]);
    expect(await rolesOf(id)).toEqual([]); // owning the address alone grants nothing
  });

  it('refuses a banned account', async () => {
    const id = await makeUser('banned', { verified: true, banned: true });
    const res = await grantBootstrapAdmins(pool, emailFor('banned'), silent);
    expect(res.granted).toEqual([]);
    expect(await rolesOf(id)).toEqual([]);
  });

  it('is idempotent and matches case-insensitively', async () => {
    const id = await makeUser('idem');
    await grantBootstrapAdmins(pool, emailFor('idem'), silent);
    const second = await grantBootstrapAdmins(pool, emailFor('idem').toUpperCase(), silent);
    expect(second.granted).toEqual([]);
    expect(second.skipped).toHaveLength(1);
    // no duplicate role entries from running twice
    const roles = await rolesOf(id);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('records an append-only audit row for the grant', async () => {
    const id = await makeUser('audited');
    await grantBootstrapAdmins(pool, emailFor('audited'), silent);
    const rows = await pool.query<{ action: string; after: { roles: string[] } }>(
      `SELECT action, after FROM admin_audit_log WHERE target_id = $1`,
      [id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.action).toBe('admin.bootstrap_grant');
    expect(rows.rows[0]!.after.roles).toEqual(expect.arrayContaining([...BOOTSTRAP_ADMIN_ROLES]));
  });

  it('reports an address with no account instead of failing', async () => {
    const res = await grantBootstrapAdmins(pool, `nobody_${suffix}@it.kurda.app`, silent);
    expect(res.missing).toHaveLength(1);
    expect(res.granted).toEqual([]);
  });

  it('never revokes a role that is already held', async () => {
    const id = await makeUser('keep');
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [id]);
    await grantBootstrapAdmins(pool, emailFor('keep'), silent);
    expect(await rolesOf(id)).toEqual(expect.arrayContaining(['moderator', ...BOOTSTRAP_ADMIN_ROLES]));
  });
});
