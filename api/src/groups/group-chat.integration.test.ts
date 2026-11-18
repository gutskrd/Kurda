/** Group chat against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { GROUP_UNREAD_CAP } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GroupService } from './service.js';
import { GroupChatService } from './chat-service.js';
import { addFriendsToGroup } from '../test/groups.js';

const DATABASE_URL = process.env.DATABASE_URL;

class FakeHub {
  published: Array<{ room: string; ev: Record<string, unknown> }> = [];
  invited: Array<{ room: string; userId: string }> = [];
  async publish(room: string, ev: Record<string, unknown>): Promise<void> {
    this.published.push({ room, ev });
  }
  async invite(room: string, userId: string): Promise<void> {
    this.invited.push({ room, userId });
  }
}

describe.skipIf(!DATABASE_URL)('group chat (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  let chat: GroupChatService;
  const hub = new FakeHub();
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};
  let gid = '';

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gc_${tag}_${suffix}@it.kurda.app`,
        username: `gc_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
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
    chat = new GroupChatService(pool, groups, hub);
    id.a = await register('a', '10.85.1.1'); // owner
    id.b = await register('b', '10.85.2.1'); // member
    id.c = await register('c', '10.85.3.1'); // member (removed later)
    id.d = await register('d', '10.85.4.1'); // non-member
    gid = (await groups.create(id.a!, { name: `Chat ${suffix}` })).id;
    await addFriendsToGroup(pool, gid, id.a!, id.b!, id.c!);
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

  it('members send + read history; non-members are refused on fetch', async () => {
    const msg = await chat.send(id.a!, gid, '  Silav hemû!  ');
    expect(msg.body).toBe('Silav hemû!');
    expect(hub.published.some((p) => p.room === `group:${gid}` && p.ev.type === 'group_msg')).toBe(true);

    const hist = (await chat.history(id.b!, gid)).messages;
    expect(hist.map((m) => m.body)).toContain('Silav hemû!');
    expect(hist[0]!.username).toContain('gc_a');

    await expect(chat.history(id.d!, gid)).rejects.toThrow(/not in this group/i);
    await expect(chat.send(id.d!, gid, 'sneaking in')).rejects.toThrow(/not in this group/i);
    // and the refusal is the one for a group that does not exist, so it tells an outsider nothing
    const none = '00000000-0000-4000-8000-000000000000';
    const real = await chat.history(id.d!, gid).catch((err: unknown) => err as { code: string; message: string });
    const made = await chat.history(id.d!, none).catch((err: unknown) => err as { code: string; message: string });
    expect([(real as { code: string }).code, (real as { message: string }).message]).toEqual([(made as { code: string }).code, (made as { message: string }).message]);
    expect(await chat.canRead(gid, id.d!)).toBe(false);
    expect(await chat.canReadEach(gid, [id.b!, id.d!, id.a!])).toEqual([true, false, true]);
  });

  it('a removed member loses history access immediately', async () => {
    await groups.removeMember(id.a!, gid, id.c!);
    await expect(chat.history(id.c!, gid)).rejects.toThrow(/not in this group/i);
  });

  it('a muted member cannot send until unmuted', async () => {
    await chat.mute(id.a!, gid, id.b!, '1h');
    await expect(chat.send(id.b!, gid, 'am I muted?')).rejects.toThrow(/muted/i);
    await chat.unmute(id.a!, gid, id.b!);
    expect((await chat.send(id.b!, gid, 'back!')).body).toBe('back!');
  });

  it('staff delete any message; authors delete their own; others cannot', async () => {
    const bMsg = await chat.send(id.b!, gid, 'delete me');
    // a plain member can't delete someone else's message → but B is the author here; use A's message
    const aMsg = await chat.send(id.a!, gid, 'owner note');
    await expect(chat.deleteMessage(id.b!, gid, aMsg.id)).rejects.toThrow(/cannot delete/i);
    // owner deletes anyone's
    await chat.deleteMessage(id.a!, gid, bMsg.id);
    const hist = (await chat.history(id.a!, gid)).messages;
    expect(hist.find((m) => m.id === bMsg.id)!.deleted).toBe(true);
    expect(hist.find((m) => m.id === bMsg.id)!.body).toBe('');
  });

  it('tracks per-group unread and clears on read', async () => {
    await chat.markRead(id.b!, gid);
    await chat.send(id.a!, gid, 'new message for B');
    const before = (await chat.unread(id.b!)).find((u) => u.groupId === gid);
    expect(before!.unread).toBeGreaterThanOrEqual(1);
    await chat.markRead(id.b!, gid);
    const after = (await chat.unread(id.b!)).find((u) => u.groupId === gid);
    expect(after!.unread).toBe(0);
  });

  it('counts a group’s unread messages up to the cap and no further', async () => {
    await chat.markRead(id.b!, gid);
    const insert = (n: number) =>
      pool.query(
        `INSERT INTO group_messages (group_id, sender_id, body) SELECT $1, $2, 'many ' || i FROM generate_series(1, $3::int) i`,
        [gid, id.a, n],
      );
    const count = async () => (await chat.unread(id.b!)).find((u) => u.groupId === gid)!.unread;
    await insert(GROUP_UNREAD_CAP - 1);
    expect(await count()).toBe(GROUP_UNREAD_CAP - 1);
    await insert(GROUP_UNREAD_CAP + 5);
    expect(await count()).toBe(GROUP_UNREAD_CAP);
    await chat.markRead(id.b!, gid);
    expect(await count()).toBe(0);
  });

  it('publishes a typing ping to the room, named, and only for members', async () => {
    const before = hub.published.length;
    await chat.typing(id.a!, gid);

    const ping = hub.published.slice(before).find((pub) => pub.ev.type === 'group_typing');
    expect(ping).toBeDefined();
    expect(ping!.room).toBe(`group:${gid}`);
    // Receivers need a name to show, without a lookup per ping.
    expect(ping!.ev).toMatchObject({ groupId: gid, userId: id.a });
    expect(String((ping!.ev as { username?: string }).username)).toContain('gc_a');

    // Removed in an earlier test; membership is re-checked, so they cannot keep pinging.
    await expect(chat.typing(id.c!, gid)).rejects.toThrow(/not in this group/i);
    await expect(chat.typing(id.d!, gid)).rejects.toThrow(/not in this group/i);
  });

  it('stores nothing for a typing ping', async () => {
    // Typing is ephemeral: nothing is stored.
    const before = await pool.query(`SELECT count(*)::int AS n FROM group_messages WHERE group_id = $1`, [gid]);
    await chat.typing(id.a!, gid);
    const after = await pool.query(`SELECT count(*)::int AS n FROM group_messages WHERE group_id = $1`, [gid]);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('rejects an over-long message', async () => {
    await expect(chat.send(id.a!, gid, 'x'.repeat(2001))).rejects.toThrow(/2000/);
  });
});
