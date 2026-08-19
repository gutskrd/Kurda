/** Realtime gateway (KUR-049) with real WebSocket clients (CI job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { CLOSE_BAD_TICKET, CLOSE_CONNECTED_ELSEWHERE } from './gateway.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

function waitFor(ws: WebSocket, predicate: (msg: WsMessage) => boolean, ms = 5_000): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for message')), ms);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as WsMessage;
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`socket closed (${code}) while waiting`));
    });
  });
}

function waitForClose(ws: WebSocket, ms = 5_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for close')), ms);
    ws.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe.skipIf(!DATABASE_URL)('realtime gateway (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
  });
  let app: FastifyInstance;
  let baseUrl: string;
  let wsUrl: string;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const sockets: WebSocket[] = [];

  async function makeUser(name: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: `10.20.0.${Math.floor(Math.random() * 200) + 1}`,
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  async function getTicket(token: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/realtime/ticket',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.20.1.1',
    });
    expect(res.statusCode).toBe(200);
    return res.json().ticket as string;
  }

  async function connect(token: string, resume?: string): Promise<{ ws: WebSocket; hello: WsMessage }> {
    const ticket = await getTicket(token);
    const ws = new WebSocket(
      `${wsUrl}/realtime?ticket=${ticket}${resume ? `&resume=${resume}` : ''}`,
    );
    sockets.push(ws);
    const hello = await waitFor(ws, (m) => m.type === 'hello');
    return { ws, hello };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsUrl = `ws://127.0.0.1:${address.port}`;
    void baseUrl;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('authenticates via single-use ticket and says hello with a resume token', async () => {
    const user = await makeUser('hello');
    const { hello } = await connect(user.token);
    expect(hello.resumeToken).toBeDefined();
    expect(hello.resumedRooms).toEqual([]);
  });

  it('rejects invalid and reused tickets with 4003', async () => {
    const bad = new WebSocket(`${wsUrl}/realtime?ticket=nope`);
    sockets.push(bad);
    expect(await waitForClose(bad)).toBe(CLOSE_BAD_TICKET);

    const user = await makeUser('reuse');
    const ticket = await getTicket(user.token);
    const first = new WebSocket(`${wsUrl}/realtime?ticket=${ticket}`);
    sockets.push(first);
    await waitFor(first, (m) => m.type === 'hello');
    const second = new WebSocket(`${wsUrl}/realtime?ticket=${ticket}`);
    sockets.push(second);
    expect(await waitForClose(second)).toBe(CLOSE_BAD_TICKET);
  });

  it('invite-gated rooms: join, receive published events, leave', async () => {
    const user = await makeUser('rooms');
    const { ws } = await connect(user.token);
    const room = `game:${suffix}:a`;

    ws.send(JSON.stringify({ type: 'join', room }));
    const denied = await waitFor(ws, (m) => m.type === 'error');
    expect(denied.code).toBe('NOT_INVITED');

    await app.realtime.invite(room, user.id);
    ws.send(JSON.stringify({ type: 'join', room }));
    await waitFor(ws, (m) => m.type === 'joined');

    await app.realtime.publish(room, { type: 'question', index: 1 });
    const event = await waitFor(ws, (m) => m.type === 'event');
    expect(event.room).toBe(room);
    expect((event.event as { type: string }).type).toBe('question');

    ws.send(JSON.stringify({ type: 'leave', room }));
    await waitFor(ws, (m) => m.type === 'left');
  });

  it('newest connection wins: the older socket closes with 4001', async () => {
    const user = await makeUser('dupe');
    const first = await connect(user.token);
    const closePromise = waitForClose(first.ws);
    const second = await connect(user.token);
    expect(await closePromise).toBe(CLOSE_CONNECTED_ELSEWHERE);
    expect(second.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('reconnect with the resume token rejoins the same rooms', async () => {
    const user = await makeUser('resume');
    const room = `game:${suffix}:resume`;
    await app.realtime.invite(room, user.id);

    const first = await connect(user.token);
    first.ws.send(JSON.stringify({ type: 'join', room }));
    await waitFor(first.ws, (m) => m.type === 'joined');
    first.ws.terminate(); // network blip

    const second = await connect(user.token, first.hello.resumeToken as string);
    expect(second.hello.resumedRooms).toEqual([room]);

    // still receives room events without re-joining
    await app.realtime.publish(room, { type: 'still-here' });
    const event = await waitFor(second.ws, (m) => m.type === 'event');
    expect((event.event as { type: string }).type).toBe('still-here');
  });

  it('application-level ping gets a pong', async () => {
    const user = await makeUser('ping');
    const { ws } = await connect(user.token);
    ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await waitFor(ws, (m) => m.type === 'pong');
    expect(pong.at).toBeGreaterThan(0);
  });

  it.skipIf(!REDIS_URL)('events cross nodes via the Redis bus', async () => {
    const nodeB = buildApp(config);
    await nodeB.listen({ port: 0, host: '127.0.0.1' });
    const bPort = (nodeB.server.address() as { port: number }).port;
    try {
      const userA = await makeUser('nodea');
      const userB = await makeUser('nodeb');
      const room = `game:${suffix}:xnode`;
      await app.realtime.invite(room, userA.id);
      await app.realtime.invite(room, userB.id); // shared Redis KV — visible to node B

      const wsA = (await connect(userA.token)).ws;
      const ticketB = await getTicket(userB.token);
      const wsB = new WebSocket(`ws://127.0.0.1:${bPort}/realtime?ticket=${ticketB}`);
      sockets.push(wsB);
      await waitFor(wsB, (m) => m.type === 'hello');

      wsA.send(JSON.stringify({ type: 'join', room }));
      await waitFor(wsA, (m) => m.type === 'joined');
      wsB.send(JSON.stringify({ type: 'join', room }));
      await waitFor(wsB, (m) => m.type === 'joined');

      // publish on node A must reach the member connected to node B
      const receivedOnB = waitFor(wsB, (m) => m.type === 'event');
      await app.realtime.publish(room, { type: 'cross-node', n: 1 });
      expect(((await receivedOnB).event as { type: string }).type).toBe('cross-node');
    } finally {
      await nodeB.close();
    }
  });

  it('heartbeat sweep reaps silent connections (unit-level)', async () => {
    const user = await makeUser('sweep');
    const { ws } = await connect(user.token);
    expect(app.realtime.connectionCount()).toBeGreaterThanOrEqual(1);
    // simulate a dead peer: sweep far in the future reaps everything idle
    const reaped = app.realtime.sweep(Date.now() + 60_000);
    expect(reaped).toBeGreaterThanOrEqual(1);
    await waitForClose(ws).catch(() => undefined);
  });
});
