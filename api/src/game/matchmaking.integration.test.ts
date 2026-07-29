/** 1v1 matchmaking (KUR-050) against real Postgres (+Redis in CI). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

function waitFor(ws: WebSocket, predicate: (m: WsMessage) => boolean, ms = 8_000): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for ws message')), ms);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as WsMessage;
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

describe.skipIf(!DATABASE_URL)('matchmaking (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
  });
  let app: FastifyInstance;
  let wsUrl: string;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const sockets: WebSocket[] = [];

  interface Player {
    id: string;
    token: string;
    username: string;
  }

  async function makePlayer(name: string, rating = 1000): Promise<Player> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: `10.21.0.${Math.floor(Math.random() * 200) + 1}`,
    });
    const id = res.json().user.id as string;
    await pool.query(`UPDATE users SET rating = $2 WHERE id = $1`, [id, rating]);
    return { id, token: res.json().tokens.accessToken, username: res.json().user.username };
  }

  async function connect(player: Player): Promise<WebSocket> {
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/realtime/ticket',
      headers: { authorization: `Bearer ${player.token}` },
      remoteAddress: '10.21.1.1',
    });
    const ws = new WebSocket(`${wsUrl}/realtime?ticket=${ticketRes.json().ticket}`);
    sockets.push(ws);
    await waitFor(ws, (m) => m.type === 'hello');
    return ws;
  }

  const queue = (player: Player) =>
    app.inject({
      method: 'POST',
      url: '/matchmaking/queue',
      headers: { authorization: `Bearer ${player.token}` },
      remoteAddress: '10.21.2.1',
    });

  beforeAll(async () => {
    app = buildApp(config, {
      matchmaking: {
        baseBand: 150,
        widenPerInterval: 200,
        widenIntervalMs: 300,
        timeoutMs: 3_000,
        sweepIntervalMs: 150,
        // isolate this file's queue from other integration files sharing one Redis
        queueKeyPrefix: `kurda:mm:it:matchmaking:${suffix}`,
      },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    wsUrl = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('two similar-rated players match; both get match_found and can join the room', async () => {
    const a = await makePlayer('ma', 1000);
    const b = await makePlayer('mb', 1050);
    const wsA = await connect(a);
    const wsB = await connect(b);

    const foundA = waitFor(wsA, (m) => m.type === 'event' && (m.event as WsMessage).type === 'match_found');
    expect((await queue(a)).json().status).toBe('queued');
    const resB = await queue(b);
    expect(resB.json().status).toBe('matched');
    const roomId = resB.json().roomId as string;
    expect(resB.json().opponent.id).toBe(a.id);

    const eventA = (await foundA).event as { roomId: string; opponent: { id: string } };
    expect(eventA.roomId).toBe(roomId);
    expect(eventA.opponent.id).toBe(b.id);

    // both were invited — join succeeds
    wsA.send(JSON.stringify({ type: 'join', room: roomId }));
    await waitFor(wsA, (m) => m.type === 'joined');
    wsB.send(JSON.stringify({ type: 'join', room: roomId }));
    await waitFor(wsB, (m) => m.type === 'joined');

    // the session engine can resolve the match record
    const record = await app.matchmaking.matchRecord(roomId);
    expect(record?.players.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('far-apart ratings do not match instantly, then match after band widening', async () => {
    const low = await makePlayer('low', 1000);
    const high = await makePlayer('high', 1400); // outside ±150
    const wsLow = await connect(low);

    expect((await queue(low)).json().status).toBe('queued');
    expect((await queue(high)).json().status).toBe('queued');

    // sweeper widens by 200 every 300ms → matched within ~a second
    const found = await waitFor(
      wsLow,
      (m) => m.type === 'event' && (m.event as WsMessage).type === 'match_found',
    );
    expect(((found.event as WsMessage).opponent as { id: string }).id).toBe(high.id);
  });

  it('cancel leaves no ghost entries', async () => {
    const solo = await makePlayer('solo', 2500);
    expect((await queue(solo)).json().status).toBe('queued');

    const cancel = await app.inject({
      method: 'POST',
      url: '/matchmaking/cancel',
      headers: { authorization: `Bearer ${solo.token}` },
      remoteAddress: '10.21.2.2',
    });
    expect(cancel.json().cancelled).toBe(true);

    const status = await app.inject({
      method: 'GET',
      url: '/matchmaking/status',
      headers: { authorization: `Bearer ${solo.token}` },
      remoteAddress: '10.21.2.3',
    });
    expect(status.json().queued).toBe(false);

    // cancelling again is a clean no-op
    const again = await app.inject({
      method: 'POST',
      url: '/matchmaking/cancel',
      headers: { authorization: `Bearer ${solo.token}` },
      remoteAddress: '10.21.2.4',
    });
    expect(again.json().cancelled).toBe(false);
  });

  it('party start forms teams for a 2v2 roster (KUR-055)', async () => {
    const roster = await Promise.all([
      makePlayer('p1'), makePlayer('p2'), makePlayer('p3'), makePlayer('p4'),
    ]);
    const userIds = roster.map((p) => p.id);
    const res = await app.inject({
      method: 'POST',
      url: '/matchmaking/party',
      headers: { authorization: `Bearer ${roster[0]!.token}` },
      payload: { mode: '2v2', userIds },
      remoteAddress: '10.21.3.1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe('2v2');
    expect(res.json().roomId).toMatch(/^match:/);
    expect(res.json().teams).toEqual([[userIds[0], userIds[1]], [userIds[2], userIds[3]]]);
  });

  it('party start rejects a caller outside the roster and a wrong-sized roster', async () => {
    const [a, b, c] = await Promise.all([makePlayer('q1'), makePlayer('q2'), makePlayer('q3')]);
    // caller not in the roster
    const notIn = await app.inject({
      method: 'POST', url: '/matchmaking/party',
      headers: { authorization: `Bearer ${c!.token}` },
      payload: { mode: '1v1', userIds: [a!.id, b!.id] },
      remoteAddress: '10.21.3.2',
    });
    expect(notIn.statusCode).toBe(403);
    // 2v2 needs 4 players
    const wrongSize = await app.inject({
      method: 'POST', url: '/matchmaking/party',
      headers: { authorization: `Bearer ${a!.token}` },
      payload: { mode: '2v2', userIds: [a!.id, b!.id] },
      remoteAddress: '10.21.3.3',
    });
    expect(wrongSize.statusCode).toBe(409);
  });

  it('waiting past the timeout notifies match_timeout and dequeues', async () => {
    const lonely = await makePlayer('lonely', 9000); // nobody near
    const ws = await connect(lonely);
    expect((await queue(lonely)).json().status).toBe('queued');

    const timeoutEvent = await waitFor(
      ws,
      (m) => m.type === 'event' && (m.event as WsMessage).type === 'match_timeout',
      10_000,
    );
    expect(((timeoutEvent.event as WsMessage).waitedMs as number)).toBeGreaterThanOrEqual(2_500);

    const status = await app.inject({
      method: 'GET',
      url: '/matchmaking/status',
      headers: { authorization: `Bearer ${lonely.token}` },
      remoteAddress: '10.21.2.5',
    });
    expect(status.json().queued).toBe(false);
  });

  it('burst of players: everyone matched exactly once, queue empty', async () => {
    const players = await Promise.all(
      Array.from({ length: 6 }, (_, i) => makePlayer(`burst${i}`, 1200 + i * 10)),
    );
    const results = await Promise.all(players.map((p) => queue(p)));

    const matchedRooms = results
      .map((r) => r.json())
      .filter((b) => b.status === 'matched')
      .map((b) => b.roomId as string);

    await vi.waitFor(
      async () => {
        const statuses = await Promise.all(
          players.map(async (p) => {
            const res = await app.inject({
              method: 'GET',
              url: '/matchmaking/status',
              headers: { authorization: `Bearer ${p.token}` },
              remoteAddress: '10.21.2.6',
            });
            return res.json().queued as boolean;
          }),
        );
        expect(statuses.every((q) => !q)).toBe(true);
      },
      { timeout: 8_000, interval: 200 },
    );

    // every player appears in exactly one match record
    const seen = new Map<string, number>();
    const allRooms = new Set<string>(matchedRooms);
    for (const room of allRooms) {
      const record = await app.matchmaking.matchRecord(room);
      for (const p of record?.players ?? []) {
        seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
      }
    }
    for (const count of seen.values()) expect(count).toBe(1);
  });
});
