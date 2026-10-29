/**
 * Clearing a group's chat, for oneself or for everyone, against real Postgres
 * and through the routes the apps call: who may, what each member's history
 * and unread count then hold, and what the room is told.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GroupService } from './service.js';
import { GroupChatService } from './chat-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('clearing a group chat (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  const published: Array<{ room: string; ev: Record<string, unknown> }> = [];
  let chat: GroupChatService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};
  let n = 0;
  const ip = (): string => `10.210.${Math.floor(++n / 250) % 250}.${(n % 250) + 1}`;

  async function person(tag: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gclr_${tag}_${suffix}@it.kurda.app`,
        username: `gclr_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    id[tag] = res.json().user.id as string;
    token[tag] = res.json().tokens.accessToken as string;
    await pool.query(`UPDATE users SET email_verified_at = now(), created_at = now() - interval '3 days' WHERE id = $1`, [id[tag]]);
  }

  const call = (tag: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token[tag]}` }, ...(payload ? { payload } : {}), remoteAddress: ip() });
  const say = async (tag: string, gid: string, body: string) => expect((await call(tag, 'POST', `/groups/${gid}/chat`, { body })).statusCode).toBe(200);
  const history = async (tag: string, gid: string) => (await call(tag, 'GET', `/groups/${gid}/chat`)).json();
  const bodies = async (tag: string, gid: string) => (await history(tag, gid)).messages.map((m: { body: string }) => m.body);
  const unread = async (tag: string, gid: string) => (await chat.unread(id[tag]!)).find((u) => u.groupId === gid)?.unread;

  /** An open group of the owner's, with an admin and two members. */
  async function group(): Promise<string> {
    const { id: gid } = await groups.create(id.owner!, { name: `Clear ${suffix} ${++n}`, privacy: 'open' });
    for (const tag of ['admin', 'm1', 'm2']) await groups.join(id[tag]!, gid);
    await groups.setRole(id.owner!, gid, id.admin!, 'moderator');
    return gid;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
    chat = new GroupChatService(pool, groups, {
      publish: async (room, ev) => void published.push({ room, ev }),
      invite: async () => undefined,
    });
    for (const tag of ['owner', 'admin', 'm1', 'm2']) await person(tag);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM groups WHERE name LIKE $1`, [`%${suffix}%`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`gclr\\_%\\_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('says nothing has been cleared in a chat nobody has cleared', async () => {
    const gid = await group();
    expect((await history('m1', gid)).cleared).toEqual({ forEveryone: null, forMe: null });
  });

  it('clears the chat for the member alone, and marks it read', async () => {
    const gid = await group();
    await say('owner', gid, 'yek');
    await say('m2', gid, 'du');
    expect(await unread('m1', gid)).toBe(2);

    const res = await call('m1', 'POST', `/groups/${gid}/chat/clear`, { for: 'me' });
    expect(res.statusCode).toBe(200);
    const cleared = res.json().cleared;
    expect(cleared).toEqual({ forEveryone: null, forMe: expect.any(String) });
    expect(await bodies('m1', gid)).toEqual([]);
    expect((await history('m1', gid)).cleared).toEqual(cleared);
    expect(await unread('m1', gid)).toBe(0);
    // everyone else still sees them, and nothing was deleted
    expect(await bodies('m2', gid)).toEqual(['yek', 'du']);
    expect((await history('m2', gid)).cleared.forMe).toBeNull();

    await say('owner', gid, 'sê');
    expect(await bodies('m1', gid)).toEqual(['sê']);
    expect(await unread('m1', gid)).toBe(1);
  });

  it('clears the chat for everyone, as the owner or an admin only, and tells the room', async () => {
    const gid = await group();
    await say('m1', gid, 'yek');
    await say('m2', gid, 'du');
    const refused = await call('m1', 'POST', `/groups/${gid}/chat/clear`, { for: 'everyone' });
    expect([refused.statusCode, refused.json().code]).toEqual([403, 'NOT_GROUP_ADMIN']);
    expect(await bodies('m2', gid)).toEqual(['yek', 'du']);

    const res = await call('admin', 'POST', `/groups/${gid}/chat/clear`, { for: 'everyone' });
    expect(res.statusCode).toBe(200);
    const { forEveryone } = res.json().cleared;
    expect(forEveryone).toEqual({ at: expect.any(String), by: `gclr_admin_${suffix}`.slice(0, 30) });
    for (const tag of ['owner', 'admin', 'm1', 'm2']) {
      expect(await bodies(tag, gid)).toEqual([]);
      expect((await history(tag, gid)).cleared.forEveryone).toEqual(forEveryone);
      expect(await unread(tag, gid)).toBe(0);
    }
    // the messages are deleted, not only hidden
    const left = await pool.query(`SELECT count(*)::int AS n FROM group_messages WHERE group_id = $1 AND deleted_at IS NULL`, [gid]);
    expect(left.rows[0].n).toBe(0);

    await say('m2', gid, 'nû');
    expect(await bodies('m1', gid)).toEqual(['nû']);
  });

  it('publishes the clear to the room, named by who cleared it', async () => {
    const gid = await group();
    const cleared = await chat.clear(id.owner!, gid, 'everyone');
    expect(published.at(-1)).toEqual({
      room: `group:${gid}`,
      ev: { type: 'group_chat_cleared', groupId: gid, at: cleared.forEveryone!.at, by: `gclr_owner_${suffix}`.slice(0, 30) },
    });
    // a clear for oneself tells nobody
    const before = published.length;
    await chat.clear(id.m1!, gid, 'me');
    expect(published.length).toBe(before);
  });

  it('keeps a message from before a clear out of the history and the unread count, even if it lands after it', async () => {
    const gid = await group();
    await chat.clear(id.admin!, gid, 'everyone');
    // written a moment before the clear, its transaction committing after it
    await pool.query(
      `INSERT INTO group_messages (group_id, sender_id, body, created_at)
       SELECT $1, $2, 'late', chat_cleared_at - interval '1 second' FROM groups WHERE id = $1`,
      [gid, id.m2],
    );
    expect(await bodies('m1', gid)).toEqual([]);
    expect(await unread('m1', gid)).toBe(0);

    // and the same for a member's own clear, though it was never read
    const own = await group();
    await chat.clear(id.m1!, own, 'me');
    await pool.query(
      `INSERT INTO group_messages (group_id, sender_id, body, created_at)
       SELECT $1, $2, 'later', chat_cleared_at - interval '1 second' FROM group_members WHERE group_id = $1 AND user_id = $3`,
      [own, id.m2, id.m1],
    );
    await pool.query(`UPDATE group_reads SET last_read_at = now() - interval '1 hour' WHERE group_id = $1 AND user_id = $2`, [own, id.m1]);
    expect(await bodies('m1', own)).toEqual([]);
    expect(await unread('m1', own)).toBe(0);
    expect(await bodies('owner', own)).toEqual(['later']);
  });

  it('starts a member who left and came back without their own clear', async () => {
    const gid = await group();
    await say('owner', gid, 'berê');
    await chat.clear(id.m1!, gid, 'me');
    await call('m1', 'POST', `/groups/${gid}/leave`);
    expect((await call('m1', 'GET', `/groups/${gid}/chat`)).json().code).toBe('NOT_A_MEMBER');
    expect((await call('m1', 'POST', `/groups/${gid}/chat/clear`, { for: 'me' })).json().code).toBe('NOT_A_MEMBER');
    await call('m1', 'POST', `/groups/${gid}/join`);
    expect(await history('m1', gid)).toMatchObject({ cleared: { forMe: null }, messages: [expect.objectContaining({ body: 'berê' })] });
  });

  it('limits how often one person clears a chat', async () => {
    const gid = await group();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await call('m2', 'POST', `/groups/${gid}/chat/clear`, { for: 'me' })).statusCode);
    expect(codes).toEqual([...Array(10).fill(200), 429]);
  });
});
