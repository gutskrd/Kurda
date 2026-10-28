/**
 * The gateway over a store that stops answering, with real WebSocket clients
 * and no database: a message that needs the store fails, and the connection
 * and the process carry on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import WebSocket from 'ws';
import { LocalRoomBus } from './bus.js';
import { RealtimeGateway } from './gateway.js';
import { MemoryKV } from './kv.js';

/** The in-memory store, which can be told to fail every read, as Redis does when it is gone. */
class FailingKV extends MemoryKV {
  failing = false;
  override async get(key: string): Promise<string | null> {
    if (this.failing) throw new Error('the store is not answering');
    return super.get(key);
  }
}

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

function next(ws: WebSocket, predicate: (msg: WsMessage) => boolean, ms = 5_000): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for message')), ms);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as WsMessage;
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

describe('realtime gateway when its store fails', () => {
  const kv = new FailingKV();
  const gateway = new RealtimeGateway(kv, new LocalRoomBus());
  let app: FastifyInstance;
  let url = '';
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    app = Fastify();
    // the ticket route reads who is signed in; a test user stands in for the auth hook
    app.addHook('onRequest', async (req) => {
      req.user = { id: '6f1c2a4e-1b2c-4d3e-8f90-123456789abc', roles: [], emailVerified: true };
    });
    await app.register(fastifyWebsocket);
    await app.register(async (scoped) => gateway.registerRoutes(scoped));
    await app.listen({ port: 0, host: '127.0.0.1' });
    url = `127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await app.close();
  });

  it('answers a join it cannot check with an error, and keeps the connection', async () => {
    const ticket = ((await (await fetch(`http://${url}/realtime/ticket`, { method: 'POST' })).json()) as { ticket: string }).ticket;
    const ws = new WebSocket(`ws://${url}/realtime?ticket=${ticket}`);
    sockets.push(ws);
    await next(ws, (m) => m.type === 'hello');

    kv.failing = true;
    const failed = next(ws, (m) => m.type === 'error');
    ws.send(JSON.stringify({ type: 'join', room: 'group:any' }));
    expect(await failed).toMatchObject({ type: 'error', code: 'UNAVAILABLE' });

    // still open, and still answering
    kv.failing = false;
    const pong = next(ws, (m) => m.type === 'pong');
    ws.send(JSON.stringify({ type: 'ping' }));
    await pong;
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });
});
