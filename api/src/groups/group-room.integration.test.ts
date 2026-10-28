/**
 * Leaving a group, or being removed from it, takes you out of its live chat
 * (integration, with real WebSocket clients).
 *
 * Reading a group's chat checks membership every time, but the live room was
 * another matter: the history read that let a member into it handed out an
 * invite for a week, and nothing took it back. Somebody removed from a group
 * went on receiving every message on the socket they had, and could join the
 * room again from a new one, for the rest of that week.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { GroupService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

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

describe.skipIf(!DATABASE_URL)('a group room keeps only its members (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  let wsUrl = '';
  const s = Date.now().toString(36);
  const sockets: WebSocket[] = [];
  let n = 0;
  const ip = (): string => `10.187.${Math.floor(++n / 250)}.${(n % 250) + 1}`;

  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `grm_${tag}_${s}@it.kurda.app`,
        username: `grm_${tag}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    await activate(app, pool, res);
    return { id: res.json().user.id as string, token: res.json().tokens.accessToken as string };
  }

  const call = (token: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}), remoteAddress: ip() });

  /** A socket for this person, and the answer to asking it into the group's room. */
  async function joinRoom(token: string, groupId: string): Promise<{ ws: WebSocket; answer: WsMessage }> {
    const ticket = (await call(token, 'POST', '/realtime/ticket')).json().ticket as string;
    const ws = new WebSocket(`${wsUrl}/realtime?ticket=${ticket}`);
    sockets.push(ws);
    await next(ws, (m) => m.type === 'hello');
    const answer = next(ws, (m) => m.type === 'joined' || m.type === 'error');
    ws.send(JSON.stringify({ type: 'join', room: `group:${groupId}` }));
    return { ws, answer: await answer };
  }

  /** An open group of `owner`'s, `members` in it, each having read its chat (which lets them into the room). */
  async function openGroup(owner: { id: string; token: string }, members: Array<{ id: string; token: string }>): Promise<string> {
    const { id } = await groups.create(owner.id, { name: `Kom ${s} ${++n}`, privacy: 'open' });
    for (const m of members) {
      await groups.join(m.id, id);
      expect((await call(m.token, 'GET', `/groups/${id}/chat`)).statusCode).toBe(200);
    }
    return id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.listen({ port: 0, host: '127.0.0.1' });
    wsUrl = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await pool.query(`DELETE FROM groups WHERE name LIKE $1`, [`Kom ${s}%`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`grm\\_%\\_${s}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('stops sending the room to a member who was removed, and keeps them out of it', async () => {
    const owner = await person('owner');
    const stays = await person('stays');
    const removed = await person('removed');
    const gid = await openGroup(owner, [stays, removed]);
    const kept = await joinRoom(stays.token, gid);
    const gone = await joinRoom(removed.token, gid);
    expect([kept.answer.type, gone.answer.type]).toEqual(['joined', 'joined']);

    expect((await call(owner.token, 'DELETE', `/groups/${gid}/members/${removed.id}`)).statusCode).toBe(200);

    // what the group says next reaches the one still in it, and not the one removed
    let leaked = false;
    gone.ws.on('message', (raw) => {
      if ((JSON.parse(raw.toString()) as WsMessage).type === 'event') leaked = true;
    });
    const heard = next(kept.ws, (m) => m.type === 'event');
    expect((await call(owner.token, 'POST', `/groups/${gid}/chat`, { body: 'Silav li hemûyan' })).statusCode).toBe(200);
    await heard;
    // a round trip on the removed socket: anything sent to it before now has arrived
    const pong = next(gone.ws, (m) => m.type === 'pong');
    gone.ws.send(JSON.stringify({ type: 'ping' }));
    await pong;
    expect(leaked).toBe(false);

    // and a new socket cannot join the room again
    expect((await joinRoom(removed.token, gid)).answer).toMatchObject({ type: 'error', code: 'NOT_INVITED' });
  });

  it('takes a member who left out of the room', async () => {
    const owner = await person('owner2');
    const leaver = await person('leaver');
    const gid = await openGroup(owner, [leaver]);
    expect((await call(leaver.token, 'POST', `/groups/${gid}/leave`)).statusCode).toBe(200);
    expect((await joinRoom(leaver.token, gid)).answer).toMatchObject({ type: 'error', code: 'NOT_INVITED' });
  });

  it('takes everyone out of the room of a group that was deleted', async () => {
    const owner = await person('owner3');
    const member = await person('member3');
    const gid = await openGroup(owner, [member]);
    expect((await call(owner.token, 'DELETE', `/groups/${gid}`)).statusCode).toBe(200);
    expect((await joinRoom(member.token, gid)).answer).toMatchObject({ type: 'error', code: 'NOT_INVITED' });
  });
});
