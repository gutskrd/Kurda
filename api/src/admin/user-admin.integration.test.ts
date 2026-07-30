/** Admin user management (KUR-101) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { UserAdminService } from './user-admin-service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('user admin (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let svc: UserAdminService;
  const suffix = Date.now().toString(36);
  let adminId = '';
  let targetId = '';
  const username = `victimc_${suffix}`.slice(0, 30);

  async function reg(name: string, ip: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${name}_${suffix}@it.kurda.app`, username: name.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: ip,
    });
    return res.json().user.id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new UserAdminService(pool, new WalletService(pool));
    adminId = await reg(`adminc_${suffix}`, '10.101.0.1');
    targetId = await reg(username, '10.101.0.2');
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('searches by username prefix and returns a detail view', async () => {
    const results = await svc.search(username.slice(0, 6));
    expect(results.some((r) => r.id === targetId)).toBe(true);

    const detail = (await svc.detail(targetId))!;
    expect(detail.username).toBe(username);
    expect(detail.ban).toBe('active');
    expect(detail.balances.zer).toBe(0);
  });

  it('adjusts the wallet through the ledger with admin_adjustment', async () => {
    const credit = await svc.adjustWallet(adminId, targetId, 'zer', 500, 'goodwill for a support ticket');
    expect(credit.ok).toBe(true);

    const detail = (await svc.detail(targetId))!;
    expect(detail.balances.zer).toBe(500);
    expect(detail.ledger[0]).toMatchObject({ currency: 'zer', amount: 500, reason: 'admin_adjustment' });
    expect(detail.actions.some((a) => a.action === 'wallet_adjust')).toBe(true);

    // over-debit is refused, balance untouched
    const over = await svc.adjustWallet(adminId, targetId, 'zer', -1000, 'clawback');
    expect(over).toEqual({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect((await svc.detail(targetId))!.balances.zer).toBe(500);
  });

  it('temp-ban sets a ban with expiry and bumps token_version; unban clears it', async () => {
    const before = await pool.query<{ token_version: number }>(`SELECT token_version FROM users WHERE id = $1`, [targetId]);
    const until = new Date(Date.now() + 24 * 3_600_000);
    expect(await svc.tempBan(adminId, targetId, 'harassment', until)).toEqual({ ok: true });

    const after = await pool.query<{ token_version: number; banned_at: Date | null }>(
      `SELECT token_version, banned_at FROM users WHERE id = $1`,
      [targetId],
    );
    expect(after.rows[0]!.token_version).toBe(before.rows[0]!.token_version + 1); // sessions revoked
    expect(after.rows[0]!.banned_at).not.toBeNull();
    expect((await svc.detail(targetId))!.ban).toBe('temp_banned');

    expect(await svc.permBan(adminId, targetId, 'repeat offender')).toEqual({ ok: true });
    expect((await svc.detail(targetId))!.ban).toBe('perm_banned');

    expect(await svc.unban(adminId, targetId, 'appeal granted')).toEqual({ ok: true });
    expect((await svc.detail(targetId))!.ban).toBe('active');
  });

  it('refuses actions on an unknown user', async () => {
    expect(await svc.warn(adminId, '00000000-0000-0000-0000-000000000000', 'x')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await svc.detail('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
