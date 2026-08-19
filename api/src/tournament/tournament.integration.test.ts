/** Tournament lifecycle (KUR-060) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { TournamentService } from './service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('tournament (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let svc: TournamentService;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const players: Array<{ id: string; token: string }> = [];
  let adminToken = '';

  const register = async (tag: string): Promise<{ id: string; token: string }> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `tourn_${tag}_${suffix}@it.kurda.app`,
        username: `tourn_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.60.0.1',
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new TournamentService(pool, new WalletService(pool));
    wallet = new WalletService(pool);

    const admin = await register('admin');
    adminToken = admin.token;
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [admin.id]);
    for (const tag of ['p1', 'p2', 'p3', 'p4']) players.push(await register(tag));
  });

  afterAll(async () => {
    // ledger cascade needs the admin flag (tournament reward writes wallet_ledger)
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

  it('admin-only creation: a normal user is forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: { authorization: `Bearer ${players[0]!.token}` },
      payload: { name: 'nope', capacity: 8, startsAt: new Date(Date.now() + 3.6e6).toISOString() },
      remoteAddress: '10.60.0.2',
    });
    expect(res.statusCode).toBe(403);
  });

  it('runs a full 4-player bracket and pays the champion', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Cup ${suffix}`,
        capacity: 8,
        startsAt: new Date(Date.now() + 3.6e6).toISOString(),
        rewardZer: 500,
      },
      remoteAddress: '10.60.0.3',
    });
    expect(create.statusCode).toBe(200);
    const tournamentId = create.json().id as string;

    for (const p of players) {
      const r = await app.inject({
        method: 'POST',
        url: `/tournaments/${tournamentId}/register`,
        headers: { authorization: `Bearer ${p.token}` },
        remoteAddress: '10.60.0.4',
      });
      expect(r.statusCode).toBe(200);
    }

    await svc.start(tournamentId);
    let view = await svc.bracket(tournamentId);
    expect(view.status).toBe('running');
    expect(view.rounds).toBe(2);
    expect(view.participants.every((p) => p.seed !== null)).toBe(true);

    // play every ready match (winner = whichever player is in slot A) until done
    let guard = 0;
    while (view.status === 'running' && guard++ < 10) {
      const ready = view.matches.find((m) => m.status === 'ready' && m.playerA && m.playerB);
      expect(ready).toBeTruthy();
      await svc.reportResult(tournamentId, ready!.id, ready!.playerA!);
      view = await svc.bracket(tournamentId);
    }

    expect(view.status).toBe('completed');
    expect(view.winnerId).toBeTruthy();
    // the champion was paid the configured reward
    expect((await wallet.balances(view.winnerId!)).zer).toBe(500);
    // everyone but the champion is eliminated
    expect(view.participants.filter((p) => !p.eliminated)).toHaveLength(1);
  });

  it('gives the top seed a bye when the field is not a power of two', async () => {
    const create = await svc.create(players[0]!.id, {
      name: `Bye ${suffix}`,
      capacity: 8,
      startsAt: new Date(Date.now() + 3.6e6),
    });
    for (const p of players.slice(0, 3)) await svc.register(create.id, p.id);
    await svc.start(create.id);
    const view = await svc.bracket(create.id);

    const round1 = view.matches.filter((m) => m.round === 1);
    // one of the two first-round matches is an auto-completed bye
    expect(round1.filter((m) => m.status === 'completed')).toHaveLength(1);
    expect(round1.filter((m) => m.status === 'ready')).toHaveLength(1);
  });

  it('auto-forfeits a no-show once the window passes', async () => {
    const create = await svc.create(players[0]!.id, {
      name: `NoShow ${suffix}`,
      capacity: 8,
      startsAt: new Date(Date.now() + 3.6e6),
    });
    for (const p of players.slice(0, 2)) await svc.register(create.id, p.id);
    await svc.start(create.id);

    let view = await svc.bracket(create.id);
    const final = view.matches.find((m) => m.status === 'ready')!;
    // only player A checks in; B is a no-show
    await svc.checkIn(create.id, final.id, final.playerA!);

    // nothing due yet for this fresh match — the tournament stays running
    // (sweep is global, so assert on THIS tournament, not the overall count)
    await svc.sweepNoShows(new Date());
    expect((await svc.bracket(create.id)).status).toBe('running');

    // …but past the window, the present player advances and wins the cup
    await svc.sweepNoShows(new Date(Date.now() + 3 * 60 * 1000));
    view = await svc.bracket(create.id);
    expect(view.status).toBe('completed');
    expect(view.winnerId).toBe(final.playerA);
  });
});
