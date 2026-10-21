/**
 * Networks against real Postgres: who a request is from behind Cloudflare,
 * which accounts count as "on the same network", the sign-up caps keyed on the
 * network, and the sightings that evidence comes from.
 *
 * Every address here comes from ranges picked per run (198.19.<run>.x and
 * 2001:db8:<run>::/48), so no other suite's rows are on the same networks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { linkedAccounts } from '../moderation/cases-service.js';
import { RiskService } from '../risk/service.js';
import { MAX_ACCOUNTS_PER_IP } from '../risk/score.js';
import { deleteUsers } from '../test/ranks.js';
import { networkHashOf } from './network-key.js';
import { pairEvidence } from './evidence.js';
import { utcDay, writeSighting } from './sightings.js';

const DATABASE_URL = process.env.DATABASE_URL;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const EDGE = '172.71.146.118'; // a Cloudflare edge
const RENDER = '10.230.0.9'; // the balancer in front of the container

describe.skipIf(!DATABASE_URL)('networks and the accounts on them (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const run = 20 + Math.floor(Math.random() * 200);
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];
  const decisionIds: string[] = [];
  let seq = 0;
  /** a fresh IPv4 network */
  const v4 = () => `198.19.${run}.${++seq}`;
  /** a fresh IPv6 /64, as a function of the host part */
  const v6net = () => {
    const n = (++seq).toString(16);
    return (host: string) => `2001:db8:${run.toString(16)}:${n}::${host}`;
  };
  /** noon UTC, this many days ago — far from midnight, so days are unambiguous */
  const noon = (daysAgo: number, plusHours = 0) => {
    const today = new Date(`${utcDay(new Date())}T12:00:00.000Z`).getTime();
    return new Date(today - daysAgo * DAY + plusHours * HOUR);
  };

  /** An account, this many days old (established after 14). */
  const account = async (ageDays = 60): Promise<string> => {
    const tag = `net_${++seq}_${suffix}`;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, email_verified_at, created_at) VALUES ($1, $2, now(), $3) RETURNING id`,
      [`${tag}@it.kurda.app`, tag.slice(0, 30), new Date(Date.now() - ageDays * DAY)],
    );
    userIds.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  };
  const seen = (userId: string, ip: string, at: Date) => writeSighting(pool, userId, networkHashOf(ip)!, at);
  const linked = async (userId: string) => linkedAccounts(pool, userId);
  const linkTo = async (a: string, b: string) => (await linked(a)).find((l) => l.id === b);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM risk_decisions WHERE id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])`, [decisionIds, userIds]);
    await deleteUsers(pool, userIds);
    await pool.end();
    await app.close();
  });

  describe('behind the Cloudflare edge', () => {
    /** a request from `client`, through Cloudflare and Render, with whatever the client added */
    const via = (client: string, extra: Record<string, string> = {}, spoof = '') => ({
      remoteAddress: RENDER,
      headers: { 'x-forwarded-for': `${spoof}${client}, ${EDGE}`, 'cf-connecting-ip': client, ...extra },
    });
    const login = (client: string, spoof = '') =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `nobody_${++seq}_${suffix}@it.kurda.app`, password: 'not-the-password' },
        ...via(client, {}, spoof),
      });

    it('gives two people behind one edge their own rate-limit budgets, which a spoofed header cannot escape', async () => {
      const a = v4();
      const b = v4();
      for (let i = 0; i < 5; i++) expect((await login(a)).statusCode).not.toBe(429);
      expect((await login(a)).statusCode).toBe(429);
      // a made-up address to the left of Cloudflare's entry is not who they are
      expect((await login(a, '198.51.100.200, ')).statusCode).toBe(429);
      expect((await login(a, `${b}, `)).statusCode).toBe(429);
      // the other person through the same edge is untouched
      expect((await login(b)).statusCode).not.toBe(429);
    });

    it('limits an IPv6 caller by its /64, so a new address is not a new budget', async () => {
      const net = v6net();
      for (let i = 0; i < 5; i++) expect((await login(net(`${i + 1}`))).statusCode).not.toBe(429);
      expect((await login(net('ffff'))).statusCode).toBe(429);
      expect((await login(v6net()('1'))).statusCode).not.toBe(429);
    });

    it('does not link two people who signed up through the same edge, and records each one’s own network', async () => {
      const register = async (client: string) => {
        const tag = `edge${++seq}${suffix}`;
        const res = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: `${tag}@it.kurda.app`, username: tag.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
          ...via(client),
        });
        expect(res.statusCode).toBe(201);
        const body = res.json() as { user: { id: string }; tokens: { accessToken: string } };
        userIds.push(body.user.id);
        return { id: body.user.id, token: body.tokens.accessToken };
      };
      const ca = v4();
      const cb = v4();
      const a = await register(ca);
      const b = await register(cb);
      expect(await linkTo(a.id, b.id)).toBeUndefined();

      const nets = await pool.query<{ net_hash: string }>(`SELECT net_hash FROM network_sightings WHERE user_id = $1`, [a.id]);
      expect(nets.rows.map((r) => r.net_hash)).toEqual([networkHashOf(ca)]);
      const decision = await pool.query<{ net_hash: string; ip_hash: string | null }>(
        `SELECT net_hash, ip_hash FROM risk_decisions WHERE user_id = $1`,
        [a.id],
      );
      expect(decision.rows[0]).toEqual({ net_hash: networkHashOf(ca), ip_hash: null });

      // a signed-in request from another network: one sighting for the day,
      // written once however many requests there are
      const elsewhere = v4();
      for (let i = 0; i < 3; i++) {
        const me = await app.inject({ method: 'GET', url: '/me', ...via(elsewhere, { authorization: `Bearer ${a.token}` }) });
        expect(me.statusCode).toBe(200);
      }
      const row = async () =>
        (
          await pool.query<{ first_at: Date; last_at: Date }>(
            `SELECT first_at, last_at FROM network_sightings WHERE user_id = $1 AND net_hash = $2 AND day = $3::date`,
            [a.id, networkHashOf(elsewhere), utcDay(new Date())],
          )
        ).rows;
      for (let i = 0; i < 50 && (await row()).length === 0; i++) await new Promise((r) => setTimeout(r, 20));
      const rows = await row();
      expect(rows).toHaveLength(1);
      // the second and third requests wrote nothing
      expect(rows[0]!.last_at.getTime()).toBe(rows[0]!.first_at.getTime());
      // and not under the edge's network
      expect((await pool.query(`SELECT 1 FROM network_sightings WHERE net_hash = $1`, [networkHashOf(EDGE)])).rowCount).toBe(0);
    });
  });

  describe('what counts as the same network', () => {
    it('links two accounts seen on a quiet network within two days, counting the days', async () => {
      const a = await account();
      const b = await account();
      const net = v4();
      await seen(a, net, noon(5));
      await seen(b, net, noon(5, 3));
      await seen(a, net, noon(3));
      await seen(b, net, noon(3, 2));
      expect(await linkTo(a, b)).toMatchObject({ via: 'network', days: 2, lastSeenTogether: noon(3).toISOString(), banned: false });
      expect(await linkTo(b, a)).toMatchObject({ via: 'network', days: 2 });
    });

    it('does not link accounts that used the same network a month apart', async () => {
      const a = await account();
      const b = await account();
      const net = v4();
      await seen(a, net, noon(35));
      await seen(b, net, noon(5));
      expect(await linkTo(a, b)).toBeUndefined();
      // nor just over two days apart
      const c = await account();
      const d = await account();
      const net2 = v4();
      await seen(c, net2, noon(10));
      await seen(d, net2, noon(8, 1));
      expect(await linkTo(c, d)).toBeUndefined();
    });

    it('does not link on a crowded network: four other established accounts around then', async () => {
      const a = await account();
      const b = await account();
      const net = v4();
      await seen(a, net, noon(10));
      await seen(b, net, noon(10, 1));
      for (const d of [16, 12, 8]) await seen(await account(), net, noon(d));
      // three others: still quiet
      expect(await linkTo(a, b)).toMatchObject({ via: 'network', days: 1 });
      await seen(await account(), net, noon(4));
      expect(await linkTo(a, b)).toBeUndefined();
    });

    it('does not count fresh accounts towards the crowd, so new accounts made at home stay linked', async () => {
      const a = await account();
      const b = await account();
      const net = v4();
      await seen(a, net, noon(10));
      await seen(b, net, noon(10, 1));
      // created twelve days ago: fresh when they were seen with A and B
      const fresh: string[] = [];
      for (let i = 0; i < 5; i++) {
        const f = await account(12);
        fresh.push(f);
        await seen(f, net, noon(9, i));
      }
      expect(await linkTo(a, b)).toMatchObject({ via: 'network' });
      // and each new account is linked to the old one it was made beside
      expect(await linkTo(a, fresh[0]!)).toMatchObject({ via: 'network' });
      expect((await linked(fresh[0]!)).map((l) => l.id)).toEqual(expect.arrayContaining([a, b, ...fresh.slice(1)]));
    });

    it('links two addresses in one IPv6 /64, and not across /64s', async () => {
      const a = await account();
      const b = await account();
      const c = await account();
      const home = v6net();
      await seen(a, home('1:2:3'), noon(6));
      await seen(b, home('9:9:9'), noon(6, 2));
      await seen(c, v6net()('1:2:3'), noon(6, 1));
      expect(await linkTo(a, b)).toMatchObject({ via: 'network', days: 1 });
      expect(await linkTo(a, c)).toBeUndefined();
    });

    it('says "device" for a device both used, even when they also shared a network', async () => {
      const a = await account();
      const b = await account();
      const device = `dev-${suffix}-${++seq}`;
      for (const id of [a, b]) {
        await pool.query(
          `INSERT INTO risk_decisions (event, user_id, device_hash, score, band, action) VALUES ('login', $1, $2, 0, 'low', 'proceed')`,
          [id, device],
        );
      }
      const net = v4();
      await seen(a, net, noon(4));
      await seen(b, net, noon(4, 1));
      expect(await linkTo(a, b)).toMatchObject({ via: 'device', days: 1 });
      expect(await pairEvidence(pool, a, b)).toMatchObject({ device: { days: 1 }, network: { days: 1 } });
    });

    it('marks a banned linked account', async () => {
      const a = await account();
      const b = await account();
      const net = v4();
      await seen(a, net, noon(4));
      await seen(b, net, noon(4, 1));
      await pool.query(`UPDATE users SET banned_at = now() WHERE id = $1`, [b]);
      expect(await linkTo(a, b)).toMatchObject({ banned: true });
    });
  });

  describe('sign-up risk by network', () => {
    const risk = () => new RiskService(pool);
    const signup = async (ip: string) => {
      const r = await risk().assessSignup({ email: `r${++seq}_${suffix}@gmail.com`, ip, deviceId: `rdev-${suffix}-${seq}` });
      decisionIds.push(r.decisionId);
      return r;
    };

    it('counts sign-ups per IPv6 /64, so rotating addresses does not reset the cap', async () => {
      const net = v6net();
      let last;
      for (let i = 0; i <= MAX_ACCOUNTS_PER_IP; i++) last = await signup(net(`${i + 1}:${i + 1}`));
      expect(last!.signals.accountsFromIpRecently).toBe(MAX_ACCOUNTS_PER_IP + 1);
      expect(last!.assessment.hardBlock).toBe(true);
      // the next /64 starts again
      expect((await signup(v6net()('1'))).signals.accountsFromIpRecently).toBe(1);
    });

    it('stores a keyed hash of the network, never the address or a plain hash of it', async () => {
      const ip = v4();
      const { decisionId } = await signup(ip);
      const row = await pool.query<{ net_hash: string; ip_hash: string | null }>(`SELECT net_hash, ip_hash FROM risk_decisions WHERE id = $1`, [
        decisionId,
      ]);
      expect(row.rows[0]).toEqual({ net_hash: networkHashOf(ip), ip_hash: null });
    });

    it('gives a network many established accounts use the shared cap instead of a hard block', async () => {
      const busy = v4();
      for (let i = 0; i < 6; i++) await seen(await account(), busy, noon(2 + i));
      let last;
      for (let i = 0; i <= MAX_ACCOUNTS_PER_IP; i++) last = await signup(busy);
      expect(last!.signals.sharedNetwork).toBe(true);
      expect(last!.assessment.hardBlock).toBe(false);
    });

    it('does not count fresh accounts as a busy network', async () => {
      const farm = v4();
      for (let i = 0; i < 6; i++) await seen(await account(3), farm, noon(1, i));
      let last;
      for (let i = 0; i <= MAX_ACCOUNTS_PER_IP; i++) last = await signup(farm);
      expect(last!.signals.sharedNetwork).toBe(false);
      expect(last!.assessment.hardBlock).toBe(true);
    });

    it('prunes sightings past ninety days with the decisions', async () => {
      const a = await account();
      const net = v4();
      await seen(a, net, noon(100));
      await seen(a, net, noon(80));
      const pruned = await risk().prune();
      expect(pruned.sightings).toBeGreaterThanOrEqual(1);
      const left = await pool.query<{ day: string }>(`SELECT to_char(day, 'YYYY-MM-DD') AS day FROM network_sightings WHERE user_id = $1`, [a]);
      expect(left.rows.map((r) => r.day)).toEqual([utcDay(noon(80))]);
    });
  });
});
