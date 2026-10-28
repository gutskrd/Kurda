import type pg from 'pg';
import {
  DECLINE_COOLDOWN_MINUTES,
  INVITE_TTL_MINUTES,
  MAX_INVITEES_PER_REQUEST,
  MAX_PENDING_PLAY_INVITES,
  REMATCH_OFFER_SECONDS,
  type ChatGameRef,
  type DeclineReason,
  type IncomingInvite,
  type InviteLists,
  type InviteStatus,
  type InviteSummary,
  type LobbyCard,
  type OutgoingInviteState,
  type PlayGame,
  type RematchState,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { limitReached, lockPersonFor } from '../limits/limits.js';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import type { FriendService } from '../friends/service.js';
import type { Notification } from '../push/service.js';
import { areFriendsSql } from '../users/age.js';
import { canJoin } from './access.js';
import { gameNotFound } from './errors.js';
import type { PlayEvents } from './events.js';
import type { LobbyFacts, PlayAdapter } from './types.js';

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

/** What the play layer uses of the services around it — narrow, so tests can stand in for them. */
export interface PlayDeps {
  adapters: readonly PlayAdapter[];
  events: PlayEvents;
  friends: Pick<FriendService, 'statusesBetween'>;
  inbox: { record(userId: string, notification: Notification): Promise<void> };
  chat: { sendCard(from: string, to: string, card: ChatGameRef, publicUrl?: PublicUrl): Promise<unknown> };
  groupChat: { sendCard(userId: string, groupId: string, card: ChatGameRef, publicUrl?: PublicUrl): Promise<unknown> };
  groups: { memberRole(groupId: string, userId: string): Promise<string | null> };
  now?: () => Date;
  log?: Log;
  publicUrl?: PublicUrl;
}

/** How a game is named in the English fallback text of an inbox entry (clients write their own from `data`). */
const GAME_NAMES: Record<PlayGame, string> = {
  'wordle-battle': 'Peyvok Battle',
  'rhyme-match': 'Rhyme Match',
  stories: 'a story quiz',
};

/** Every invite the host may have waiting is waiting: answers, or invites running out, make room. */
function tooManyInvites(): AppError {
  return limitReached('play_invites_pending', `you have ${MAX_PENDING_PLAY_INVITES} invites waiting for an answer`);
}

/** Answered invites stay in the host's list this long, so "can't play right now" is seen. */
const OUTGOING_HOURS = 1;
/** Answered invites are kept this long, then deleted by the sweep. */
const KEEP_INVITE_DAYS = 30;
/** Deleting old invites and offers is not urgent: once an hour is plenty. */
const CLEANUP_EVERY_MS = 60 * 60 * 1000;

interface InviteRow {
  id: string;
  game: PlayGame;
  lobby_id: string;
  host_id: string;
  invitee_id: string;
  status: InviteStatus;
  decline_reason: DeclineReason | null;
  rematch_of: string | null;
  /** the join rule would refuse the friend: the host sees the invite, the friend never does */
  held: boolean;
  created_at: Date;
  expires_at: Date;
  responded_at: Date | null;
}

interface PersonRow {
  username: string;
  display_name: string | null;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
}

export interface CreateLobbyInput {
  game: PlayGame;
  settings: unknown;
  invite?: readonly string[];
  /** where the host started it: a DM with this friend (who is invited), or a group chat (which gets the card) */
  chat?: { userId: string } | { groupId: string };
}

/**
 * Starting a game with friends and playing again — the same for every online
 * game (contract §B, @kurda/shared `play`).
 *
 * - An invite is a row (`play_invites`): one pending per host, friend and game,
 *   a newer one replacing the older, and at most MAX_PENDING_PLAY_INVITES
 *   waiting from one host at once; it lasts INVITE_TTL_MINUTES, or until the
 *   lobby starts, fills or is called off. It reaches the friend three ways at
 *   once: a game card in their DM with the host, a `play_invite` event (the
 *   banner) and an inbox entry. Only friends are ever invited; anybody else is
 *   skipped without a word, and the host is told only how many were invited.
 *   A friend the game would turn away is invited as far as the host can tell
 *   and held from the friend (see `inviteTo`), so the count never says who is
 *   a minor or who has blocked whom.
 * - Accepting is the game's own join (so the rule is checked once, under the
 *   game's lock), and saying yes twice is the same as once.
 * - Two players play again by both asking (a rematch starts at once, with both
 *   in it); more than two, the host opens the next round and the others join
 *   it with one tap. Nobody is ever put into a game they did not choose.
 */
export class PlayService {
  private readonly adapters = new Map<PlayGame, PlayAdapter>();
  private readonly now: () => Date;
  private readonly log: Log;
  private readonly publicUrl: PublicUrl;
  private lastCleanup = 0;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: PlayDeps,
  ) {
    for (const a of deps.adapters) {
      this.adapters.set(a.game, a);
      deps.events.attach(a.game, (id) => a.facts(id));
    }
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? { warn: () => undefined };
    this.publicUrl = deps.publicUrl ?? (() => null);
  }

  /** A game the play layer can drive; Stories only once its service is wired in. */
  adapter(game: PlayGame): PlayAdapter {
    const a = this.adapters.get(game);
    if (!a) throw new AppError('GAME_UNAVAILABLE', 404, 'this game cannot be played with friends here yet');
    return a;
  }

  // ---- starting a game ------------------------------------------------------------

  /**
   * `POST /play/lobbies`: a lobby with the host in it, its card posted where it
   * was started, and the friends asked. A group card that cannot be posted
   * (muted, no longer a member) calls the new lobby off again — it was made to
   * be shared there.
   */
  async createLobby(hostId: string, input: CreateLobbyInput): Promise<{ game: PlayGame; lobbyId: string; invited: number }> {
    const adapter = this.adapter(input.game);
    const groupId = input.chat && 'groupId' in input.chat ? input.chat.groupId : null;
    if (groupId && !(await this.deps.groups.memberRole(groupId, hostId))) {
      throw new AppError('NOT_A_MEMBER', 403, 'you are not in this group');
    }
    // a host with no invites left to send is told before a lobby is made for them
    const invitees = [...(input.invite ?? [])];
    if (input.chat && 'userId' in input.chat) invitees.push(input.chat.userId);
    if (invitees.length > 0 && (await this.pendingFrom(this.pool, hostId, this.now())) >= MAX_PENDING_PLAY_INVITES) {
      throw tooManyInvites();
    }
    const lobbyId = await adapter.create(hostId, input.settings, { chatGroupId: groupId, fromChat: input.chat !== undefined });
    if (groupId) {
      try {
        await this.deps.groupChat.sendCard(hostId, groupId, { game: input.game, lobbyId }, this.publicUrl);
      } catch (err) {
        await adapter.cancel?.(hostId, lobbyId).catch(() => undefined);
        throw err;
      }
    }
    const invited = invitees.length > 0 ? (await this.inviteTo(hostId, input.game, lobbyId, invitees)).invited : 0;
    return { game: input.game, lobbyId, invited };
  }

  /**
   * `POST /play/invites`: the host asks friends into their lobby. Always "ok"
   * with a count; who was skipped, and why, is never said. The one refusal is
   * the host's own: every one of their MAX_PENDING_PLAY_INVITES is waiting for
   * an answer, so not one more could go — said only when none went, since the
   * ones that did are on their way.
   */
  async invite(hostId: string, game: PlayGame, lobbyId: string, userIds: readonly string[]): Promise<{ invited: number }> {
    const { invited, limited } = await this.inviteTo(hostId, game, lobbyId, userIds);
    if (invited === 0 && limited) throw tooManyInvites();
    return { invited };
  }

  /** The invites `hostId` has out that are still waiting for an answer. */
  private async pendingFrom(executor: Pick<pg.Pool, 'query'>, hostId: string, now: Date): Promise<number> {
    const r = await executor.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM play_invites WHERE host_id = $1 AND status = 'pending' AND expires_at > $2`,
      [hostId, now],
    );
    return r.rows[0]!.n;
  }

  private async inviteTo(
    hostId: string,
    game: PlayGame,
    lobbyId: string,
    userIds: readonly string[],
  ): Promise<{ invited: number; limited: boolean }> {
    const adapter = this.adapter(game);
    const facts = await adapter.facts(lobbyId);
    if (!facts || !facts.memberIds.includes(hostId)) throw gameNotFound();
    if (facts.hostId !== hostId) throw new AppError('NOT_HOST', 403, 'only the host can invite people');
    if (facts.phase === 'cancelled') throw gameNotFound();
    if (!facts.joinable) throw new AppError('GAME_STARTED', 409, 'this game has already started');
    if (facts.activeIds.length >= facts.maxPlayers) throw new AppError('GAME_FULL', 409, 'this game is full');

    // who played the game this lobby followed: an invite to one of them says
    // "again". Read once, out here, never inside an invite's transaction (see
    // recordInvite)
    const before = facts.rematchOf ? await adapter.facts(facts.rematchOf) : null;

    const now = this.now();
    const wanted = [...new Set(userIds)].filter((id) => id !== hostId).slice(0, MAX_INVITEES_PER_REQUEST);
    const sent: InviteRow[] = [];
    const superseded: InviteRow[] = [];
    let invited = 0;
    let limited = false;
    // friends only; a block reads as 'blocked' here. Everyone asked, in one query
    const statuses = await this.deps.friends.statusesBetween(hostId, wanted);
    for (const inviteeId of wanted) {
      if (facts.memberIds.includes(inviteeId) || facts.removedIds.includes(inviteeId)) continue;
      if (statuses.get(inviteeId) !== 'friends') continue;
      // A friend the game would turn away — a minor or an account of unknown
      // age and an open game, a block either way with someone already in it —
      // is invited exactly as far as the host can tell: counted, listed as
      // pending, expiring when its time is up, and with a card in the DM like
      // anyone's. Leaving them out would make `invited` a minor detector over
      // any adult's friends list, and a block detector between third parties.
      // The invite is held instead: the card reads 'unavailable' to them (as a
      // game that does not exist), and no banner, inbox entry or event follows.
      const held = !(await canJoin(this.pool, joinCheckFor(facts, inviteeId)));
      const rematchOf = before?.memberIds.includes(inviteeId) ? facts.rematchOf : null;
      const outcome = await this.recordInvite(hostId, inviteeId, facts, now, { held, rematchOf });
      if (outcome === 'cooldown') continue;
      if (outcome === 'limit') {
        // the host's own limit: nobody further down the list could be asked either
        limited = true;
        break;
      }
      invited++;
      if (outcome === 'unchanged') continue;
      sent.push(outcome.invite);
      if (outcome.replaced) superseded.push(outcome.replaced);
    }

    for (const old of superseded) {
      // the friend never saw a held invite go out, so they do not see it go either
      if (old.held) continue;
      await this.deps.events.tell(old.invitee_id, { type: 'play_invite_update', inviteId: old.id, status: 'cancelled' });
    }
    if (sent.length > 0) {
      // a host still inviting people is not idling
      await adapter.touch?.(lobbyId).catch(() => undefined);
      const host = await this.person(hostId);
      const summary = (await adapter.summary(lobbyId).catch(() => null)) ?? {};
      for (const row of sent) await this.deliver(row, host, summary);
      this.deps.events.changed(game, lobbyId);
    }
    return { invited, limited };
  }

  /**
   * One invite, in one transaction under a lock on (host, friend, game): no
   * new invite within DECLINE_COOLDOWN_MINUTES of a "not now" to this game; the
   * same lobby's invite still pending is left as it is (asking twice notifies
   * once); any other pending one is cancelled and replaced. One that would be
   * a new invite waiting, beyond the host's MAX_PENDING_PLAY_INVITES, is not
   * made ('limit'): that count is read under the host's own lock, taken before
   * the pair's, so a burst of invites at once cannot all slip under it.
   *
   * Everything it needs is worked out before it takes its pool client, and
   * it asks the pool for nothing else until that client is back: a request
   * holding one connection while waiting for another is how a burst of
   * invites takes every connection and then waits on itself.
   */
  private async recordInvite(
    hostId: string,
    inviteeId: string,
    facts: LobbyFacts,
    now: Date,
    { held, rematchOf }: { held: boolean; rematchOf: string | null },
  ): Promise<'cooldown' | 'limit' | 'unchanged' | { invite: InviteRow; replaced: InviteRow | null }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockPersonFor(client, 'play-invites', hostId);
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('play-invite:' || $1 || ':' || $2 || ':' || $3, 0))`, [
        hostId,
        inviteeId,
        facts.game,
      ]);
      const declined = await client.query(
        `SELECT 1 FROM play_invites
          WHERE host_id = $1 AND invitee_id = $2 AND game = $3 AND status = 'declined'
            AND responded_at > $4::timestamptz - ($5 || ' minutes')::interval
          LIMIT 1`,
        [hostId, inviteeId, facts.game, now, String(DECLINE_COOLDOWN_MINUTES)],
      );
      if (declined.rowCount) {
        await client.query('COMMIT');
        return 'cooldown';
      }
      const pending = await client.query<InviteRow>(
        `SELECT * FROM play_invites WHERE host_id = $1 AND invitee_id = $2 AND game = $3 AND status = 'pending'`,
        [hostId, inviteeId, facts.game],
      );
      const old = pending.rows[0] ?? null;
      if (old && old.lobby_id === facts.lobbyId && old.expires_at > now) {
        await client.query('COMMIT');
        return 'unchanged';
      }
      // replacing one still waiting leaves as many waiting as before; anything else adds one
      const replacing = old !== null && old.expires_at > now;
      if (!replacing && (await this.pendingFrom(client, hostId, now)) >= MAX_PENDING_PLAY_INVITES) {
        await client.query('COMMIT');
        return 'limit';
      }
      let replaced: InviteRow | null = null;
      if (old) {
        const status: InviteStatus = old.expires_at > now ? 'cancelled' : 'expired';
        await client.query(`UPDATE play_invites SET status = $2, responded_at = $3 WHERE id = $1`, [old.id, status, now]);
        if (status === 'cancelled') replaced = old;
      }
      const row = await client.query<InviteRow>(
        `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, rematch_of, held, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7::timestamptz + ($8 || ' minutes')::interval)
         RETURNING *`,
        [facts.game, facts.lobbyId, hostId, inviteeId, rematchOf, held, now, String(INVITE_TTL_MINUTES)],
      );
      await client.query('COMMIT');
      return { invite: row.rows[0]!, replaced };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The three ways an invite reaches the friend, none of which may fail it:
   * a game card in the DM between them, the live banner, and the inbox (with
   * English fallback text; the apps write their own from `data`).
   *
   * A held invite gets the card and nothing else. The card is in the host's
   * copy of the conversation too, so leaving it out would show the host which
   * friends were held; to the friend it reads 'unavailable', because a card is
   * drawn for each viewer through the join rule.
   */
  private async deliver(row: InviteRow, host: { name: string; avatarUrl: string | null }, summary: InviteSummary): Promise<void> {
    const card: ChatGameRef = { game: row.game, lobbyId: row.lobby_id };
    await this.deps.chat.sendCard(row.host_id, row.invitee_id, card, this.publicUrl).catch((err: unknown) => {
      this.log.warn({ err }, 'invite card not posted');
    });
    if (row.held) return;
    await this.deps.events.tell(row.invitee_id, { type: 'play_invite', invite: toIncoming(row, host, summary) });
    await this.deps.inbox
      .record(row.invitee_id, {
        category: 'games',
        title: 'Game invite',
        body: `${host.name} invited you to ${row.game === 'stories' ? '' : 'play '}${GAME_NAMES[row.game]}.`,
        data: { kind: 'play_invite', inviteId: row.id, game: row.game, lobbyId: row.lobby_id },
      })
      .catch((err: unknown) => this.log.warn({ err }, 'invite not recorded in the inbox'));
  }

  // ---- answering an invite --------------------------------------------------------

  /**
   * `POST /play/invites/:id/accept`: the game's own join. Saying yes again
   * once in is the same yes. An invite whose lobby can no longer be joined
   * expires, and the answer is the join's own (404, or 409 started / full).
   */
  async accept(userId: string, inviteId: string): Promise<{ game: PlayGame; lobbyId: string }> {
    const row = await this.ownInvite(inviteId, userId, 'invitee_id');
    const answer = { game: row.game, lobbyId: row.lobby_id };
    if (row.status === 'accepted') return answer;
    if (row.status !== 'pending') throw new AppError('INVITE_CLOSED', 409, 'this invite is no longer open', { status: row.status });
    const outcome = await this.adapter(row.game).join(userId, row.lobby_id);
    if (outcome === 'joined' || outcome === 'already') {
      const done = await this.pool.query(
        `UPDATE play_invites SET status = 'accepted', responded_at = $2 WHERE id = $1 AND status = 'pending'`,
        [row.id, this.now()],
      );
      if (done.rowCount) await this.deps.events.tell(row.host_id, { type: 'play_invite_update', inviteId: row.id, status: 'accepted' });
      return answer;
    }
    await this.closeInvite(row, 'expired');
    if (outcome === 'started') throw new AppError('GAME_STARTED', 409, 'this game has already started');
    if (outcome === 'full') throw new AppError('GAME_FULL', 409, 'this game is full');
    throw gameNotFound();
  }

  /** `POST /play/invites/:id/decline`: "not now", with a preset reason the host sees softly worded. */
  async decline(userId: string, inviteId: string, reason: DeclineReason | null): Promise<void> {
    const row = await this.ownInvite(inviteId, userId, 'invitee_id');
    if (row.status !== 'pending') return;
    const res = await this.pool.query(
      `UPDATE play_invites SET status = 'declined', decline_reason = $2, responded_at = $3 WHERE id = $1 AND status = 'pending'`,
      [row.id, reason, this.now()],
    );
    if (res.rowCount) {
      await this.deps.events.tell(row.host_id, {
        type: 'play_invite_update',
        inviteId: row.id,
        status: 'declined',
        declineReason: reason,
      });
    }
  }

  /** `DELETE /play/invites/:id`: the host takes an invite back; the friend's banner goes. */
  async cancel(hostId: string, inviteId: string): Promise<void> {
    const row = await this.ownInvite(inviteId, hostId, 'host_id');
    if (row.status !== 'pending') return;
    await this.closeInvite(row, 'cancelled');
  }

  /** `GET /play/invites`: the banners to show, and the host's list of answers. */
  async lists(userId: string): Promise<InviteLists> {
    const now = this.now();
    await this.pool.query(
      `UPDATE play_invites SET status = 'expired', responded_at = expires_at
        WHERE status = 'pending' AND expires_at <= $2 AND (invitee_id = $1 OR host_id = $1)`,
      [userId, now],
    );
    const incomingRows = await this.pool.query<InviteRow & PersonRow>(
      `SELECT i.*, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key
         FROM play_invites i JOIN users u ON u.id = i.host_id
        WHERE i.invitee_id = $1 AND i.status = 'pending' AND NOT i.held AND u.deleted_at IS NULL
          -- still friends (a block ends a friendship), as when it was sent
          AND ${areFriendsSql('i.host_id', '$1::uuid')}
        ORDER BY i.created_at DESC LIMIT 20`,
      [userId],
    );
    const incoming: IncomingInvite[] = [];
    for (const r of incomingRows.rows) {
      const adapter = this.adapters.get(r.game);
      const facts = adapter ? await adapter.facts(r.lobby_id) : null;
      // a lobby that cannot be joined any more takes its invite with it
      if (!adapter || !facts || !facts.joinable || facts.activeIds.length >= facts.maxPlayers) {
        await this.closeInvite(r, 'expired');
        continue;
      }
      const summary = (await adapter.summary(r.lobby_id).catch(() => null)) ?? {};
      incoming.push(toIncoming(r, this.personOf(r), summary));
    }

    const outgoingRows = await this.pool.query<InviteRow & PersonRow>(
      `SELECT i.*, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key
         FROM play_invites i JOIN users u ON u.id = i.invitee_id
        WHERE i.host_id = $1 AND i.status <> 'cancelled' AND u.deleted_at IS NULL
          AND i.created_at > $2::timestamptz - ($3 || ' hours')::interval
          AND NOT EXISTS (SELECT 1 FROM blocks b
                           WHERE (b.blocker_id = $1 AND b.blocked_id = i.invitee_id)
                              OR (b.blocker_id = i.invitee_id AND b.blocked_id = $1))
        ORDER BY i.created_at DESC LIMIT 50`,
      [userId, now, String(OUTGOING_HOURS)],
    );
    const groups = new Map<string, { game: PlayGame; lobbyId: string; invitees: OutgoingInviteState[] }>();
    for (const r of outgoingRows.rows) {
      const key = `${r.game}:${r.lobby_id}`;
      let group = groups.get(key);
      if (!group) {
        group = { game: r.game, lobbyId: r.lobby_id, invitees: [] };
        groups.set(key, group);
      }
      const who = this.personOf(r);
      group.invitees.push({
        inviteId: r.id,
        userId: r.invitee_id,
        name: who.name,
        avatarUrl: who.avatarUrl,
        status: r.status,
        declineReason: r.decline_reason,
      });
    }
    return { incoming, outgoing: [...groups.values()] };
  }

  // ---- Rated or Friendly -----------------------------------------------------------

  /**
   * `PUT /play/:game/:lobbyId/rated`: the host changes the badge, in the lobby
   * only (contract-4 §R2). The game tells everyone in it (`play_changed`), and
   * anyone who joined for the other kind may leave; a lobby costs nothing to leave.
   */
  async setRated(hostId: string, game: PlayGame, lobbyId: string, rated: boolean): Promise<void> {
    await this.adapter(game).setRated(hostId, lobbyId, rated);
  }

  // ---- chat cards -------------------------------------------------------------------

  /** `GET /play/cards/:game/:lobbyId`: a card's live state, or 'unavailable'. */
  async card(viewerId: string, game: PlayGame, lobbyId: string): Promise<LobbyCard> {
    const adapter = this.adapters.get(game);
    if (!adapter) {
      return { game, lobbyId, status: 'unavailable', players: 0, maxPlayers: 0, summary: {}, canJoin: false, isMember: false };
    }
    return adapter.card(viewerId, lobbyId);
  }

  // ---- playing again ----------------------------------------------------------------

  /** `GET /play/:game/:lobbyId/rematch`, for a member of the game. */
  async rematchState(userId: string, game: PlayGame, lobbyId: string): Promise<RematchState> {
    const facts = await this.memberFacts(userId, game, lobbyId);
    return this.stateFor(userId, facts);
  }

  /**
   * `POST /play/:game/:lobbyId/rematch`. Two players: record the offer, and
   * when both have offered, start the rematch. More than two: the host opens
   * the next round (and only the host).
   */
  async offerRematch(userId: string, game: PlayGame, lobbyId: string): Promise<RematchState> {
    const adapter = this.adapter(game);
    let facts = await this.memberFacts(userId, game, lobbyId);
    if (facts.phase !== 'finished') throw new AppError('NOT_FINISHED', 409, 'this game has not finished');
    if (facts.nextLobbyId) return this.stateFor(userId, facts);

    if (facts.rematchKind === 'round') {
      if (facts.hostId !== userId) throw new AppError('NOT_HOST', 403, 'only the host can open the next round');
      await adapter.openNextRound(userId, lobbyId);
    } else {
      const other = facts.memberIds.find((id) => id !== userId);
      if (!other) throw new AppError('NOT_A_PAIR', 409, 'a rematch is for two players');
      const both = await this.recordOffer(game, lobbyId, userId, other);
      if (both) {
        try {
          await adapter.startPairRematch(lobbyId);
        } catch (err) {
          // the join rule said no (a block since, a group left): no rematch,
          // and nothing said about why
          if (!(err instanceof AppError && err.code === 'GAME_NOT_FOUND')) throw err;
        }
      }
    }
    facts = (await adapter.facts(lobbyId)) ?? facts;
    await this.rematchChanged(facts);
    return this.stateFor(userId, facts);
  }

  /** `DELETE /play/:game/:lobbyId/rematch`: "no thanks", or leaving the results — the offer is off. */
  async declineRematch(userId: string, game: PlayGame, lobbyId: string): Promise<RematchState> {
    const facts = await this.memberFacts(userId, game, lobbyId);
    if (facts.rematchKind === 'pair' && !facts.nextLobbyId) {
      await this.pool.query(
        `INSERT INTO play_rematches (game, lobby_id, user_id, created_at, declined_at) VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (game, lobby_id, user_id) DO UPDATE SET declined_at = EXCLUDED.declined_at`,
        [game, lobbyId, userId, this.now()],
      );
      await this.rematchChanged(facts);
    }
    return this.stateFor(userId, facts);
  }

  /** Records an offer; true when the other player's offer is standing too. */
  private async recordOffer(game: PlayGame, lobbyId: string, userId: string, otherId: string): Promise<boolean> {
    const now = this.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // both offers are judged under one lock, so two players tapping at the
      // same moment cannot each miss the other's offer
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('play-rematch:' || $1 || ':' || $2, 0))`, [game, lobbyId]);
      await client.query(
        `INSERT INTO play_rematches (game, lobby_id, user_id, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (game, lobby_id, user_id) DO UPDATE SET created_at = EXCLUDED.created_at, declined_at = NULL`,
        [game, lobbyId, userId, now],
      );
      const theirs = await client.query<{ created_at: Date; declined_at: Date | null }>(
        `SELECT created_at, declined_at FROM play_rematches WHERE game = $1 AND lobby_id = $2 AND user_id = $3`,
        [game, lobbyId, otherId],
      );
      await client.query('COMMIT');
      return standing(theirs.rows[0], now);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async stateFor(userId: string, facts: LobbyFacts): Promise<RematchState> {
    const finished = facts.phase === 'finished';
    if (facts.rematchKind === 'round') {
      return {
        kind: 'round',
        offeredByMe: false,
        offeredByOther: false,
        otherDeclined: false,
        nextLobbyId: facts.nextLobbyId,
        canOpenRound: finished && facts.hostId === userId && facts.nextLobbyId === null,
        series: null,
      };
    }
    const other = facts.memberIds.find((id) => id !== userId) ?? null;
    const offers = await this.pool.query<{ user_id: string; created_at: Date; declined_at: Date | null }>(
      `SELECT user_id, created_at, declined_at FROM play_rematches WHERE game = $1 AND lobby_id = $2`,
      [facts.game, facts.lobbyId],
    );
    const now = this.now();
    const mine = offers.rows.find((o) => o.user_id === userId);
    const theirs = other ? offers.rows.find((o) => o.user_id === other) : undefined;
    return {
      kind: 'pair',
      offeredByMe: standing(mine, now),
      offeredByOther: standing(theirs, now),
      otherDeclined: theirs?.declined_at != null,
      nextLobbyId: facts.nextLobbyId,
      canOpenRound: false,
      series: finished && other ? await this.adapter(facts.game).series(facts.lobbyId, userId, other) : null,
    };
  }

  /** Everyone in the game hears that the rematch picture changed. */
  private async rematchChanged(facts: LobbyFacts): Promise<void> {
    for (const id of facts.memberIds) {
      await this.deps.events.tell(id, { type: 'rematch_update', game: facts.game, lobbyId: facts.lobbyId });
    }
  }

  // ---- housekeeping -----------------------------------------------------------------

  /**
   * On a timer: the games close idle lobbies and end games that are over;
   * invites past their time expire (both sides told); and, once an hour, old
   * invites and rematch offers are deleted.
   */
  async sweep(): Promise<void> {
    for (const a of this.adapters.values()) {
      await a.sweep?.().catch((err: unknown) => this.log.warn({ err, game: a.game }, 'play sweep failed'));
    }
    const now = this.now();
    const expired = await this.pool.query<{ id: string; host_id: string; invitee_id: string; held: boolean }>(
      `UPDATE play_invites SET status = 'expired', responded_at = expires_at
        WHERE status = 'pending' AND expires_at <= $1
        RETURNING id, host_id, invitee_id, held`,
      [now],
    );
    for (const r of expired.rows) {
      await this.deps.events.tell(r.host_id, { type: 'play_invite_update', inviteId: r.id, status: 'expired' });
      if (!r.held) await this.deps.events.tell(r.invitee_id, { type: 'play_invite_update', inviteId: r.id, status: 'expired' });
    }
    if (now.getTime() - this.lastCleanup < CLEANUP_EVERY_MS) return;
    this.lastCleanup = now.getTime();
    await this.pool.query(
      `DELETE FROM play_invites WHERE id IN (
         SELECT id FROM play_invites WHERE status <> 'pending' AND created_at < $1::timestamptz - ($2 || ' days')::interval LIMIT 1000)`,
      [now, String(KEEP_INVITE_DAYS)],
    );
    // an offer means nothing after REMATCH_OFFER_SECONDS; a day is generous
    await this.pool.query(`DELETE FROM play_rematches WHERE created_at < $1::timestamptz - interval '1 day'`, [now]);
  }

  // ---- internals --------------------------------------------------------------------

  private async memberFacts(userId: string, game: PlayGame, lobbyId: string): Promise<LobbyFacts> {
    const facts = await this.adapter(game).facts(lobbyId);
    if (!facts || !facts.memberIds.includes(userId)) throw gameNotFound();
    return facts;
  }

  /**
   * An invite of this user's (as invitee or host); anyone else's is not found.
   * Nor is one held from its invitee: they were never asked, so it is not
   * theirs to answer.
   */
  private async ownInvite(inviteId: string, userId: string, side: 'invitee_id' | 'host_id'): Promise<InviteRow> {
    const res = await this.pool.query<InviteRow>(
      `SELECT * FROM play_invites WHERE id = $1 AND ${side} = $2 ${side === 'invitee_id' ? 'AND NOT held' : ''}`,
      [inviteId, userId],
    );
    const row = res.rows[0];
    if (!row) throw new AppError('INVITE_NOT_FOUND', 404, 'no such invite');
    if (row.status === 'pending' && row.expires_at <= this.now()) {
      await this.closeInvite(row, 'expired');
      return { ...row, status: 'expired' };
    }
    return row;
  }

  /** Ends a pending invite; both sides are told (the invitee only of one they were shown). */
  private async closeInvite(row: Pick<InviteRow, 'id' | 'host_id' | 'invitee_id'>, status: 'cancelled' | 'expired'): Promise<void> {
    const res = await this.pool.query<{ held: boolean }>(
      `UPDATE play_invites SET status = $2, responded_at = $3 WHERE id = $1 AND status = 'pending' RETURNING held`,
      [row.id, status, this.now()],
    );
    const closed = res.rows[0];
    if (!closed) return;
    await this.deps.events.tell(row.host_id, { type: 'play_invite_update', inviteId: row.id, status });
    if (!closed.held) await this.deps.events.tell(row.invitee_id, { type: 'play_invite_update', inviteId: row.id, status });
  }

  private async person(userId: string): Promise<{ name: string; avatarUrl: string | null }> {
    const res = await this.pool.query<PersonRow>(
      `SELECT username, display_name, profile_photo_key, selected_avatar_key FROM users WHERE id = $1`,
      [userId],
    );
    const row = res.rows[0];
    return row ? this.personOf(row) : { name: 'Someone', avatarUrl: null };
  }

  private personOf(row: PersonRow): { name: string; avatarUrl: string | null } {
    return {
      name: row.display_name?.trim() || row.username,
      avatarUrl: resolveAvatarUrl(row.profile_photo_key, row.selected_avatar_key, this.publicUrl),
    };
  }
}

/** The join rule's question for a lobby and someone not in it yet. */
function joinCheckFor(facts: LobbyFacts, userId: string) {
  return {
    joinerId: userId,
    hostId: facts.hostId,
    access: facts.access,
    memberIds: facts.memberIds,
    chatGroupId: facts.chatGroupId,
    removed: facts.removedIds.includes(userId),
  };
}

/** A rematch offer counts while it is fresh and not taken back. */
function standing(offer: { created_at: Date; declined_at: Date | null } | undefined, now: Date): boolean {
  return offer !== undefined && offer.declined_at === null && now.getTime() - offer.created_at.getTime() <= REMATCH_OFFER_SECONDS * 1000;
}

function toIncoming(row: InviteRow, from: { name: string; avatarUrl: string | null }, summary: InviteSummary): IncomingInvite {
  return {
    id: row.id,
    game: row.game,
    lobbyId: row.lobby_id,
    status: row.status,
    from,
    summary,
    rematch: row.rematch_of !== null,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}
