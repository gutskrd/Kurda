/**
 * Invites, game cards and playing again, through the routes (contract §B3),
 * against real Postgres. Stories goes through the same layer with its own
 * adapter once its service is wired in — see the todo at the end.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { MAX_INVITEES_PER_REQUEST, REMATCH_OFFER_SECONDS, dictionaryKey, letterKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend, block } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const WORDS = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];

interface User {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('play: invites, cards and playing again (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const entryIds: string[] = [];
  const groupIds: string[] = [];
  const told: Array<{ userId: string; event: Record<string, unknown> }> = [];
  let ip = 0;

  const register = async (tag: string, years = 30): Promise<User> => {
    const birth = bornYearsAgo(years);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `play_${tag}_${suffix}@it.kurda.app`,
        username: `pl_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...birth,
      },
      remoteAddress: `10.149.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = async (who: User, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.149.250.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  const eventsFor = (userId: string, type: string) =>
    told.filter((t) => t.userId === userId && t.event.type === type).map((t) => t.event);
  const lobby = async (host: User, invite: string[] = [], extra: Record<string, unknown> = {}) => {
    const res = await call(host, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { difficulty: 'medium' }, invite, ...extra });
    expect(res.status).toBe(201);
    return res.body as { game: string; lobbyId: string; invited: number };
  };
  const inviteOf = async (lobbyId: string, inviteeId: string) =>
    (
      await pool.query<{ id: string; status: string; decline_reason: string | null }>(
        `SELECT id, status, decline_reason FROM play_invites WHERE lobby_id = $1 AND invitee_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [lobbyId, inviteeId],
      )
    ).rows[0];
  /** plays a Wordle Battle to the end: everyone guesses the word */
  const finish = async (lobbyId: string, host: User, players: User[]) => {
    expect((await call(host, 'POST', `/wordle/battles/${lobbyId}/start`)).status).toBe(200);
    const target = (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [lobbyId])).rows[0]!.target;
    for (const p of players) expect((await call(p, 'POST', `/wordle/battles/${lobbyId}/guesses`, { word: target })).status).toBe(200);
  };
  const eventually = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('never happened');
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const w of WORDS) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
         VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
        [w, letterKey(w), dictionaryKey(w)],
      );
      entryIds.push(r.rows[0]!.id);
    }
    // what reaches people's devices, without a socket
    vi.spyOn(app.realtime, 'notifyUser').mockImplementation(async (userId, event) => {
      told.push({ userId, event: event as Record<string, unknown> });
    });
  });

  afterAll(async () => {
    if (groupIds.length) await pool.query(`DELETE FROM groups WHERE id = ANY($1)`, [groupIds]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
    await app.close();
  });

  it('an invite reaches a friend three ways — a card in the DM, the banner event, the inbox — and only friends are asked', async () => {
    const host = await register('host1');
    const friend = await register('friend1');
    const stranger = await register('stranger1');
    await befriend(pool, host.id, friend.id);

    const made = await lobby(host, [friend.id, stranger.id]);
    expect(made.invited).toBe(1); // the stranger is skipped without a word
    expect(await inviteOf(made.lobbyId, stranger.id)).toBeUndefined();
    expect((await inviteOf(made.lobbyId, friend.id))!.status).toBe('pending');

    const card = await pool.query(
      `SELECT kind, game, game_lobby_id, body FROM dm_messages WHERE sender_id = $1 AND kind = 'game'`,
      [host.id],
    );
    expect(card.rows).toEqual([{ kind: 'game', game: 'wordle-battle', game_lobby_id: made.lobbyId, body: null }]);

    const [banner] = eventsFor(friend.id, 'play_invite') as Array<{ invite: Record<string, unknown> }>;
    expect(banner!.invite).toMatchObject({
      game: 'wordle-battle',
      lobbyId: made.lobbyId,
      status: 'pending',
      summary: { difficulty: 'medium' },
      rematch: false,
    });
    expect((banner!.invite.from as { name: string }).name).toContain('pl_host1');

    const inbox = await pool.query<{ category: string; data: Record<string, string>; body: string }>(
      `SELECT category, data, body FROM notifications WHERE user_id = $1`,
      [friend.id],
    );
    expect(inbox.rows).toHaveLength(1);
    expect(inbox.rows[0]!.category).toBe('games');
    expect(inbox.rows[0]!.data).toEqual({
      kind: 'play_invite',
      inviteId: (await inviteOf(made.lobbyId, friend.id))!.id,
      game: 'wordle-battle',
      lobbyId: made.lobbyId,
    });
    expect(inbox.rows[0]!.body).toMatch(/invited you to play Wordle Battle/);

    const theirs = await call(friend, 'GET', '/play/invites');
    expect(theirs.body.incoming).toHaveLength(1);
    const mine = await call(host, 'GET', '/play/invites');
    expect(mine.body.outgoing).toEqual([
      {
        game: 'wordle-battle',
        lobbyId: made.lobbyId,
        invitees: [expect.objectContaining({ userId: friend.id, status: 'pending', declineReason: null })],
      },
    ]);
  });

  it('accepting is the game’s own join, and saying yes twice is one yes; the host hears it', async () => {
    const host = await register('host2');
    const friend = await register('friend2');
    await befriend(pool, host.id, friend.id);
    const made = await lobby(host, [friend.id]);
    const invite = (await inviteOf(made.lobbyId, friend.id))!;

    const yes = await call(friend, 'POST', `/play/invites/${invite.id}/accept`);
    expect(yes).toEqual({ status: 200, body: { game: 'wordle-battle', lobbyId: made.lobbyId } });
    expect((await call(friend, 'POST', `/play/invites/${invite.id}/accept`)).status).toBe(200);
    expect(eventsFor(host.id, 'play_invite_update')).toEqual([{ type: 'play_invite_update', inviteId: invite.id, status: 'accepted' }]);

    const battle = await call(friend, 'GET', `/wordle/battles/${made.lobbyId}`);
    expect(battle.body.me).not.toBeNull();
    const card = await call(friend, 'GET', `/play/cards/wordle-battle/${made.lobbyId}`);
    expect(card.body).toMatchObject({ status: 'open', players: 2, isMember: true, canJoin: false });
    // someone else's invite is nobody's business
    expect((await call(host, 'POST', `/play/invites/${invite.id}/accept`)).status).toBe(404);
  });

  it('joining another way — the card in the DM, a link — answers the invite: the host sees "joined", the banner goes', async () => {
    const host = await register('host13');
    const friend = await register('friend13');
    await befriend(pool, host.id, friend.id);
    const made = await lobby(host, [friend.id]);
    const invite = (await inviteOf(made.lobbyId, friend.id))!;

    expect((await call(friend, 'POST', `/wordle/battles/${made.lobbyId}/join`)).status).toBe(200);
    await eventually(async () => (await inviteOf(made.lobbyId, friend.id))!.status === 'accepted');
    const update = { type: 'play_invite_update', inviteId: invite.id, status: 'accepted' };
    await eventually(async () => eventsFor(host.id, 'play_invite_update').length > 0 && eventsFor(friend.id, 'play_invite_update').length > 0);
    expect(eventsFor(host.id, 'play_invite_update')).toEqual([update]);
    expect(eventsFor(friend.id, 'play_invite_update')).toEqual([update]);
    expect((await call(friend, 'GET', '/play/invites')).body.incoming).toEqual([]);
    const mine = await call(host, 'GET', '/play/invites');
    expect(mine.body.outgoing[0].invitees[0]).toMatchObject({ userId: friend.id, status: 'accepted' });
    // and saying yes on the banner afterwards is still the same yes
    expect((await call(friend, 'POST', `/play/invites/${invite.id}/accept`)).status).toBe(200);
  });

  it('declining shows the host the reason; the same game cannot be re-sent for a while, another game can', async () => {
    const host = await register('host3');
    const friend = await register('friend3');
    await befriend(pool, host.id, friend.id);
    const made = await lobby(host, [friend.id]);
    const invite = (await inviteOf(made.lobbyId, friend.id))!;

    expect((await call(friend, 'POST', `/play/invites/${invite.id}/decline`, { reason: 'not_this_game' })).status).toBe(200);
    expect(eventsFor(host.id, 'play_invite_update')).toEqual([
      { type: 'play_invite_update', inviteId: invite.id, status: 'declined', declineReason: 'not_this_game' },
    ]);
    const mine = await call(host, 'GET', '/play/invites');
    expect(mine.body.outgoing[0].invitees[0]).toMatchObject({ status: 'declined', declineReason: 'not_this_game' });
    // a free-text reason is not a thing
    expect((await call(friend, 'POST', `/play/invites/${invite.id}/decline`, { reason: 'go away' })).status).toBe(400);

    // cooldown: asking again for the same game sends nothing (and still says ok)
    const again = await lobby(host, [friend.id]);
    expect(again.invited).toBe(0);
    expect(await inviteOf(again.lobbyId, friend.id)).toBeUndefined();
    // a different game is a different question — and "not now" needs no reason
    const rhyme = await call(host, 'POST', '/play/lobbies', { game: 'rhyme-match', settings: { dialect: 'kurmanci' }, invite: [friend.id] });
    expect(rhyme).toMatchObject({ status: 201, body: { invited: 1 } });
    const rhymeInvite = (await inviteOf(rhyme.body.lobbyId, friend.id))!;
    expect((await call(friend, 'POST', `/play/invites/${rhymeInvite.id}/decline`)).status).toBe(200);
    expect(await inviteOf(rhyme.body.lobbyId, friend.id)).toMatchObject({ status: 'declined', decline_reason: null });
  });

  it('one pending invite per host, friend and game: a new lobby replaces it, the same lobby twice notifies once', async () => {
    const host = await register('host4');
    const friend = await register('friend4');
    await befriend(pool, host.id, friend.id);
    const first = await lobby(host, [friend.id]);
    const firstInvite = (await inviteOf(first.lobbyId, friend.id))!;
    const twice = await call(host, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: first.lobbyId, userIds: [friend.id] });
    expect(twice.body).toEqual({ ok: true, invited: 1 });
    expect(eventsFor(friend.id, 'play_invite')).toHaveLength(1);

    const second = await lobby(host, [friend.id]);
    expect((await inviteOf(first.lobbyId, friend.id))!.status).toBe('cancelled');
    expect((await inviteOf(second.lobbyId, friend.id))!.status).toBe('pending');
    expect(eventsFor(friend.id, 'play_invite_update')).toContainEqual({
      type: 'play_invite_update',
      inviteId: firstInvite.id,
      status: 'cancelled',
    });
    expect((await call(friend, 'GET', '/play/invites')).body.incoming.map((i: { lobbyId: string }) => i.lobbyId)).toEqual([second.lobbyId]);
  });

  it('the host takes an invite back; expired invites and invites to a started lobby cannot be accepted', async () => {
    const host = await register('host5');
    const friend = await register('friend5');
    const other = await register('other5');
    await befriend(pool, host.id, friend.id);
    await befriend(pool, host.id, other.id);

    const made = await lobby(host, [friend.id]);
    const invite = (await inviteOf(made.lobbyId, friend.id))!;
    expect((await call(friend, 'DELETE', `/play/invites/${invite.id}`)).status).toBe(404); // not theirs to cancel
    expect((await call(host, 'DELETE', `/play/invites/${invite.id}`)).status).toBe(200);
    expect(eventsFor(friend.id, 'play_invite_update')).toContainEqual({ type: 'play_invite_update', inviteId: invite.id, status: 'cancelled' });
    expect((await call(friend, 'POST', `/play/invites/${invite.id}/accept`)).body.code).toBe('INVITE_CLOSED');

    // past its time: gone from the list, and closed
    const later = await lobby(host, [friend.id]);
    const old = (await inviteOf(later.lobbyId, friend.id))!;
    await pool.query(`UPDATE play_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [old.id]);
    expect((await call(friend, 'GET', '/play/invites')).body.incoming).toEqual([]);
    expect((await inviteOf(later.lobbyId, friend.id))!.status).toBe('expired');

    // the lobby starts without them: the invite expires, and both sides are told
    const started = await lobby(host, [friend.id, other.id]);
    const pendingInvite = (await inviteOf(started.lobbyId, friend.id))!;
    const otherInvite = (await inviteOf(started.lobbyId, other.id))!;
    expect((await call(other, 'POST', `/play/invites/${otherInvite.id}/accept`)).status).toBe(200);
    expect((await call(host, 'POST', `/wordle/battles/${started.lobbyId}/start`)).status).toBe(200);
    await eventually(async () => (await inviteOf(started.lobbyId, friend.id))!.status === 'expired');
    expect(eventsFor(friend.id, 'play_invite_update')).toContainEqual({ type: 'play_invite_update', inviteId: pendingInvite.id, status: 'expired' });
    expect((await call(friend, 'POST', `/play/invites/${pendingInvite.id}/accept`)).status).toBe(409);
  });

  it(`only the host invites, at most ${MAX_INVITEES_PER_REQUEST} at a time, and only to presets`, async () => {
    const host = await register('host6');
    const member = await register('member6');
    const minor = await register('minor6', 15);
    const stranger = await register('stranger6');
    for (const u of [member, minor]) await befriend(pool, host.id, u.id);
    const made = await lobby(host, [member.id]);
    const inv = (await inviteOf(made.lobbyId, member.id))!;
    await call(member, 'POST', `/play/invites/${inv.id}/accept`);

    const notHost = await call(member, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: made.lobbyId, userIds: [host.id] });
    expect(notHost.body.code).toBe('NOT_HOST');
    const notIn = await call(stranger, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: made.lobbyId, userIds: [host.id] });
    expect(notIn).toMatchObject({ status: 404, body: { code: 'GAME_NOT_FOUND' } });
    const tooMany = Array.from({ length: MAX_INVITEES_PER_REQUEST + 1 }, () => crypto.randomUUID());
    expect((await call(host, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: made.lobbyId, userIds: tooMany })).status).toBe(400);

    // a minor cannot open a game to everyone
    const minorOpen = await call(minor, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { access: 'open' } });
    expect(minorOpen).toMatchObject({ status: 403, body: { code: 'OPEN_GAMES_ADULTS_ONLY' } });
    // settings that are not presets are refused
    const bad = await call(host, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { difficulty: 'impossible' } });
    expect(bad).toMatchObject({ status: 400, body: { code: 'BAD_SETTINGS' } });
  });

  it('a friend the game would turn away is invited as far as the host can tell — and is never asked', async () => {
    const host = await register('host12');
    const adult = await register('adult12');
    const minor = await register('minor12', 15);
    const member = await register('member12');
    const blockedByMember = await register('blocked12');
    for (const u of [adult, minor, member, blockedByMember]) await befriend(pool, host.id, u.id);
    const typesFor = (userId: string) => told.filter((t) => t.userId === userId).map((t) => t.event.type);

    // an open game and a minor friend: counted, listed and carded exactly like an adult friend,
    // so `invited` tells an adult nothing about which of their friends are children
    const open = await lobby(host, [adult.id, minor.id], { settings: { access: 'open' } });
    expect(open.invited).toBe(2);
    const outgoing = (await call(host, 'GET', '/play/invites')).body.outgoing.find(
      (g: { lobbyId: string }) => g.lobbyId === open.lobbyId,
    ) as { invitees: Array<{ userId: string; status: string }> };
    expect(outgoing.invitees.map((i) => `${i.userId}:${i.status}`).sort()).toEqual([`${adult.id}:pending`, `${minor.id}:pending`].sort());
    const cards = await pool.query(`SELECT 1 FROM dm_messages WHERE sender_id = $1 AND game_lobby_id = $2`, [host.id, open.lobbyId]);
    expect(cards.rowCount).toBe(2);

    // the adult is asked; the minor gets only the card, which reads as a game that does not exist
    expect(eventsFor(adult.id, 'play_invite')).toHaveLength(1);
    expect(typesFor(minor.id)).toEqual(['dm']);
    expect((await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [minor.id])).rowCount).toBe(0);
    expect((await call(minor, 'GET', '/play/invites')).body.incoming).toEqual([]);
    expect((await call(minor, 'GET', `/play/cards/wordle-battle/${open.lobbyId}`)).body.status).toBe('unavailable');
    // an invite they were never shown is not theirs to answer, and it stays pending for the host
    const held = (await inviteOf(open.lobbyId, minor.id))!;
    expect((await call(minor, 'POST', `/play/invites/${held.id}/accept`)).status).toBe(404);
    expect((await call(minor, 'POST', `/play/invites/${held.id}/decline`)).status).toBe(404);
    expect((await inviteOf(open.lobbyId, minor.id))!.status).toBe('pending');

    // a friend with a block against someone already in the game: the same, so
    // the count says nothing about who has blocked whom
    const made = await lobby(host, [member.id]);
    await call(member, 'POST', `/play/invites/${(await inviteOf(made.lobbyId, member.id))!.id}/accept`);
    await block(pool, member.id, blockedByMember.id);
    const hostChanges = eventsFor(host.id, 'play_changed').length;
    const blocked = await call(host, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: made.lobbyId, userIds: [blockedByMember.id] });
    expect(blocked.body).toEqual({ ok: true, invited: 1 });
    // the lobby's changes reach its players, never the friend the invite is held from
    await eventually(async () => eventsFor(host.id, 'play_changed').length > hostChanges);
    expect(typesFor(blockedByMember.id)).toEqual(['dm']);

    // taken back like anyone's: the host hears it, the friend does not
    const back = (await inviteOf(made.lobbyId, blockedByMember.id))!;
    expect((await call(host, 'DELETE', `/play/invites/${back.id}`)).status).toBe(200);
    expect(eventsFor(host.id, 'play_invite_update')).toContainEqual({ type: 'play_invite_update', inviteId: back.id, status: 'cancelled' });
    expect(typesFor(blockedByMember.id)).toEqual(['dm']);
  });

  it('a card shows its live state to members and to friends who may join; anyone else sees "unavailable"', async () => {
    const host = await register('host7');
    const friend = await register('friend7');
    const stranger = await register('stranger7');
    const blocked = await register('blocked7');
    await befriend(pool, host.id, friend.id);
    await befriend(pool, host.id, blocked.id);
    const made = await lobby(host);
    const url = `/play/cards/wordle-battle/${made.lobbyId}`;
    expect((await call(friend, 'GET', url)).body).toMatchObject({ status: 'open', canJoin: true, isMember: false, players: 1, maxPlayers: 8 });
    expect((await call(stranger, 'GET', url)).body).toEqual({
      game: 'wordle-battle',
      lobbyId: made.lobbyId,
      status: 'unavailable',
      players: 0,
      maxPlayers: 0,
      summary: {},
      canJoin: false,
      isMember: false,
    });
    await block(pool, host.id, blocked.id);
    expect((await call(blocked, 'GET', url)).body.status).toBe('unavailable');
    // and a lobby that does not exist looks exactly the same
    const missing = await call(stranger, 'GET', `/play/cards/wordle-battle/${crypto.randomUUID()}`);
    expect(missing.body.status).toBe('unavailable');
  });

  it("a lobby shared into an invite-only group posts its card there, and the group's members may join", async () => {
    const host = await register('host8');
    const owner = await register('owner8');
    const groupMate = await register('mate8');
    const outsider = await register('out8');
    await befriend(pool, owner.id, host.id);
    await befriend(pool, owner.id, groupMate.id);
    const g = await call(owner, 'POST', '/groups', { name: `Lîstik ${suffix}`, privacy: 'invite' });
    expect(g.status).toBe(200);
    const gid = g.body.id as string;
    groupIds.push(gid);
    expect((await call(owner, 'POST', `/groups/${gid}/invite`, { userId: host.id })).status).toBeLessThan(300);
    expect((await call(owner, 'POST', `/groups/${gid}/invite`, { userId: groupMate.id })).status).toBeLessThan(300);

    const made = await lobby(host, [], { chat: { groupId: gid } });
    const posted = await pool.query(`SELECT kind, game, game_lobby_id FROM group_messages WHERE group_id = $1`, [gid]);
    expect(posted.rows).toEqual([{ kind: 'game', game: 'wordle-battle', game_lobby_id: made.lobbyId }]);
    const history = await call(groupMate, 'GET', `/groups/${gid}/chat`);
    expect(JSON.stringify(history.body)).toContain(made.lobbyId);

    // the group-mate is not the host's friend, but may join through the group
    expect((await call(groupMate, 'GET', `/play/cards/wordle-battle/${made.lobbyId}`)).body).toMatchObject({ status: 'open', canJoin: true });
    expect((await call(groupMate, 'POST', `/wordle/battles/${made.lobbyId}/join`)).status).toBe(200);
    expect((await call(outsider, 'GET', `/play/cards/wordle-battle/${made.lobbyId}`)).body.status).toBe('unavailable');

    // sharing into a group you are not in is refused, and leaves no lobby behind
    const before = await pool.query(`SELECT count(*)::int AS n FROM wordle_battles WHERE created_by = $1`, [outsider.id]);
    const refused = await call(outsider, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: {}, chat: { groupId: gid } });
    expect(refused).toMatchObject({ status: 403, body: { code: 'NOT_A_MEMBER' } });
    const after = await pool.query(`SELECT count(*)::int AS n FROM wordle_battles WHERE created_by = $1`, [outsider.id]);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('a pair rematch needs both: an offer, "no thanks", then both ask and it starts at once, with the running score', async () => {
    const host = await register('host9');
    const friend = await register('friend9');
    await befriend(pool, host.id, friend.id);
    const made = await lobby(host, [friend.id]);
    await call(friend, 'POST', `/play/invites/${(await inviteOf(made.lobbyId, friend.id))!.id}/accept`);
    const url = `/play/wordle-battle/${made.lobbyId}/rematch`;
    expect((await call(host, 'POST', url)).body.code).toBe('NOT_FINISHED');
    await finish(made.lobbyId, host, [host, friend]);

    const offered = await call(host, 'POST', url);
    expect(offered.body).toMatchObject({ kind: 'pair', offeredByMe: true, offeredByOther: false, nextLobbyId: null });
    expect(eventsFor(friend.id, 'rematch_update')).toHaveLength(1);
    expect((await call(friend, 'GET', url)).body).toMatchObject({ offeredByMe: false, offeredByOther: true });

    // no thanks
    expect((await call(friend, 'DELETE', url)).status).toBe(200);
    expect((await call(host, 'GET', url)).body).toMatchObject({ otherDeclined: true, nextLobbyId: null });

    // an offer goes stale after a minute on the results screen
    await call(host, 'POST', url);
    await pool.query(
      `UPDATE play_rematches SET created_at = now() - ($2 || ' seconds')::interval WHERE lobby_id = $1 AND user_id = $3`,
      [made.lobbyId, String(REMATCH_OFFER_SECONDS + 1), host.id],
    );
    expect((await call(friend, 'GET', url)).body.offeredByOther).toBe(false);

    // both ask: it starts, with both in it
    await call(host, 'POST', url);
    const both = await call(friend, 'POST', url);
    expect(both.body.nextLobbyId).toBeTruthy();
    const next = both.body.nextLobbyId as string;
    expect((await call(host, 'GET', url)).body.nextLobbyId).toBe(next);
    const nextBattle = await call(friend, 'GET', `/wordle/battles/${next}`);
    expect(nextBattle.body).toMatchObject({ status: 'active' });
    expect(nextBattle.body.players).toHaveLength(2);
    // asking again changes nothing
    expect((await call(host, 'POST', url)).body.nextLobbyId).toBe(next);

    // the running score after the rematch: two draws (same word, same guesses)
    await call(host, 'POST', `/wordle/battles/${next}/guesses`, {
      word: (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [next])).rows[0]!.target,
    });
    await call(friend, 'POST', `/wordle/battles/${next}/guesses`, {
      word: (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [next])).rows[0]!.target,
    });
    const series = (await call(friend, 'GET', `/play/wordle-battle/${next}/rematch`)).body.series;
    expect(series.me + series.other + series.draws).toBe(2);

    // only players see any of this
    const outsider = await register('out9');
    expect((await call(outsider, 'GET', url)).status).toBe(404);
  });

  it('a round: the host opens the next one, the others see it and join with one tap', async () => {
    const host = await register('host10');
    const a = await register('a10');
    const b = await register('b10');
    await befriend(pool, host.id, a.id);
    await befriend(pool, host.id, b.id);
    const made = await lobby(host, [a.id, b.id]);
    for (const p of [a, b]) await call(p, 'POST', `/play/invites/${(await inviteOf(made.lobbyId, p.id))!.id}/accept`);
    await finish(made.lobbyId, host, [host, a, b]);
    const url = `/play/wordle-battle/${made.lobbyId}/rematch`;

    expect((await call(a, 'GET', url)).body).toMatchObject({ kind: 'round', canOpenRound: false, nextLobbyId: null });
    expect((await call(host, 'GET', url)).body.canOpenRound).toBe(true);
    expect((await call(a, 'POST', url)).body.code).toBe('NOT_HOST');
    const opened = await call(host, 'POST', url);
    const next = opened.body.nextLobbyId as string;
    expect(next).toBeTruthy();
    expect(eventsFor(a.id, 'rematch_update').length).toBeGreaterThan(0);
    expect((await call(a, 'GET', url)).body.nextLobbyId).toBe(next);
    // nobody was put in it: the host alone, until the others choose to join
    expect((await call(a, 'GET', `/play/cards/wordle-battle/${next}`)).body).toMatchObject({ players: 1, isMember: false, canJoin: true });
    expect((await call(a, 'POST', `/wordle/battles/${next}/join`)).status).toBe(200);

    // inviting an earlier player to the next round says it is a rematch
    const inv = await call(host, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: next, userIds: [b.id] });
    expect(inv.body.invited).toBe(1);
    const banner = (await call(b, 'GET', '/play/invites')).body.incoming.find((i: { lobbyId: string }) => i.lobbyId === next);
    expect(banner.rematch).toBe(true);
  });

  it('every change to a lobby is a play_changed to its players and pending invitees', async () => {
    const host = await register('host11');
    const friend = await register('friend11');
    const invitee = await register('invitee11');
    await befriend(pool, host.id, friend.id);
    await befriend(pool, host.id, invitee.id);
    const made = await lobby(host, [friend.id, invitee.id]);
    told.length = 0;
    await call(friend, 'POST', `/play/invites/${(await inviteOf(made.lobbyId, friend.id))!.id}/accept`);
    const changed = { type: 'play_changed', game: 'wordle-battle', lobbyId: made.lobbyId };
    await eventually(async () => [host, friend, invitee].every((u) => eventsFor(u.id, 'play_changed').length > 0));
    for (const u of [host, friend, invitee]) expect(eventsFor(u.id, 'play_changed')[0]).toEqual(changed);
  });

  it.todo(
    'Stories through the play layer (play/adapters/stories.ts): invite, accept, card, pair rematch and next round. ' +
      "The adapter is written against API-games' StoryGamesService (createFromInvite, join, card, summary, " +
      'openNextRound, startPairRematch, leave, onChange); it is wired by passing that service as `stories` to ' +
      'registerPlayRoutes in app.ts once both branches are merged, and this test then runs the same flow as Wordle Battle above.',
  );
});
