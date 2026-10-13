/** Game cards in DMs and group chats (contract §B3 `sendCard`) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ChatService, type ChatModeration } from './service.js';
import { FriendService } from '../friends/service.js';
import { GroupService } from '../groups/service.js';
import { GroupChatService } from '../groups/chat-service.js';
import { befriend, block } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;

class FakeNotifier {
  sent: Array<{ userId: string; event: Record<string, unknown> }> = [];
  async notifyUser(userId: string, event: Record<string, unknown>): Promise<void> {
    this.sent.push({ userId, event });
  }
}

class FakeHub {
  published: Array<{ room: string; ev: Record<string, unknown> }> = [];
  async publish(room: string, ev: Record<string, unknown>): Promise<void> {
    this.published.push({ room, ev });
  }
  async invite(): Promise<void> {}
}

/** Moderation that mutes exactly the accounts in `muted`, and masks nothing. */
class FakeModeration implements ChatModeration {
  muted = new Set<string>();
  async isChatMuted(userId: string): Promise<boolean> {
    return this.muted.has(userId);
  }
  filter(text: string) {
    return { masked: text, flagged: false };
  }
  async recordOffense(): Promise<void> {}
}

describe.skipIf(!DATABASE_URL)('game cards in chats (integration)', () => {
  let pool: pg.Pool;
  let chat: ChatService;
  let groupChat: GroupChatService;
  let groups: GroupService;
  const notifier = new FakeNotifier();
  const hub = new FakeHub();
  const moderation = new FakeModeration();
  const suffix = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];
  const groupIds: string[] = [];

  const makeUser = async (): Promise<string> => {
    const n = users.length;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month) VALUES ($1, $2, 1990, 6) RETURNING id`,
      [`gcard_${n}_${suffix}@it.kurda.app`, `gcard_${n}_${suffix}`],
    );
    users.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };
  const card = () => ({ game: 'wordle-battle' as const, lobbyId: randomUUID() });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    chat = new ChatService(pool, new FriendService(pool), notifier, moderation);
    groups = new GroupService(pool);
    groupChat = new GroupChatService(pool, groups, hub, moderation);
  });

  afterAll(async () => {
    if (groupIds.length) await pool.query(`DELETE FROM groups WHERE id = ANY($1)`, [groupIds]);
    if (users.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
    await pool.end();
  });

  it('a DM card reaches a friend live, with no text, and shows in the history as a card', async () => {
    const host = await makeUser();
    const friend = await makeUser();
    await befriend(pool, host, friend);
    const ref = card();
    const sent = await chat.sendCard(host, friend, ref);
    expect(sent).toMatchObject({ kind: 'game', game: ref, body: null, senderId: host });

    const live = notifier.sent.find((s) => s.userId === friend && s.event.type === 'dm');
    expect((live!.event.message as { kind: string; game: unknown }).kind).toBe('game');
    expect((live!.event.message as { game: unknown }).game).toEqual(ref);

    const history = await chat.history(friend, host);
    const row = history.find((m) => m.id === sent.id)!;
    expect(row).toMatchObject({ kind: 'game', game: ref, body: null });
    // text messages say what they are too
    const text = await chat.send(friend, host, 'Were!');
    expect(text).toMatchObject({ kind: 'text', game: null });
    expect((await chat.history(host, friend)).find((m) => m.id === text.id)).toMatchObject({ kind: 'text', game: null });

    // the conversation list never prints a null preview for a card (installed phone builds print it)
    await chat.sendCard(host, friend, card());
    const convo = (await chat.conversations(friend)).find((c) => c.userId === host)!;
    expect(convo.lastMessage).toBe('');
  });

  it('keeps the DM rules: friends only, a block drops it silently, a mute refuses it', async () => {
    const host = await makeUser();
    const stranger = await makeUser();
    await expect(chat.sendCard(host, stranger, card())).rejects.toMatchObject({ code: 'NOT_FRIENDS' });
    await expect(chat.sendCard(host, host, card())).rejects.toMatchObject({ code: 'SELF_DM' });

    const blocked = await makeUser();
    await befriend(pool, host, blocked);
    await block(pool, blocked, host);
    const before = notifier.sent.length;
    const dropped = await chat.sendCard(host, blocked, card());
    expect(dropped.kind).toBe('game'); // looks sent
    const stored = await pool.query(`SELECT 1 FROM dm_messages WHERE id = $1`, [dropped.id]);
    expect(stored.rowCount).toBe(0); // but nothing was stored
    expect(notifier.sent.length).toBe(before); // nor delivered

    const friend = await makeUser();
    await befriend(pool, host, friend);
    moderation.muted.add(host);
    try {
      await expect(chat.sendCard(host, friend, card())).rejects.toMatchObject({ code: 'CHAT_MUTED' });
    } finally {
      moderation.muted.delete(host);
    }
  });

  it('a group card is posted by a member, to the room, and shows in the group history', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const outsider = await makeUser();
    const gid = (await groups.create(owner, { name: `Cards ${suffix}`, privacy: 'invite' })).id;
    groupIds.push(gid);
    await befriend(pool, owner, member);
    await groups.invite(owner, gid, member);

    const ref = card();
    const posted = await groupChat.sendCard(owner, gid, ref);
    expect(posted).toMatchObject({ kind: 'game', game: ref, body: null });
    const ev = hub.published.find((p) => p.room === `group:${gid}` && p.ev.type === 'group_msg');
    expect((ev!.ev.message as { game: unknown }).game).toEqual(ref);

    const history = await groupChat.history(member, gid);
    expect(history.find((m) => m.id === posted.id)).toMatchObject({ kind: 'game', game: ref, body: null, deleted: false });

    // the group's rules hold: members only, and a muted member cannot post one
    await expect(groupChat.sendCard(outsider, gid, card())).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
    await groupChat.mute(owner, gid, member, '1h');
    await expect(groupChat.sendCard(member, gid, card())).rejects.toMatchObject({ code: 'MUTED' });

    // a deleted card is gone from the history's view of it
    await groupChat.deleteMessage(owner, gid, posted.id);
    expect((await groupChat.history(owner, gid)).find((m) => m.id === posted.id)).toMatchObject({ deleted: true, game: null });
  });
});
