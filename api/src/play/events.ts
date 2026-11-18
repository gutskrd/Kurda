import type pg from 'pg';
import type { PlayGame, PlayUserEvent } from '@kurda/shared';
import { groupRoom } from '../groups/chat-service.js';
import type { LobbyChange, LobbyFacts } from './types.js';

/** Just enough of the realtime gateway: a user's own channel, and a room. */
export interface PlayNotifier {
  notifyUser(userId: string, event: Record<string, unknown>): Promise<void>;
  publish(room: string, event: Record<string, unknown>): Promise<void>;
}

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

/** Changes to one lobby within this long go out as one `play_changed` (and one more at the end). */
export const PLAY_CHANGED_COALESCE_MS = 300;

interface Window {
  timer: NodeJS.Timeout;
  /** something changed after the window opened: send once more when it closes */
  dirty: boolean;
  also: Set<string>;
  /** one of those changes could show on a chat card */
  card: boolean;
}

/** An invite, as far as telling its two people about it goes. */
interface InviteRef {
  id: string;
  host_id: string;
  invitee_id: string;
  held: boolean;
}

/**
 * `play_changed`: whenever a lobby or its game changes, everyone who would see it is told to refetch: its players
 * (present or gone), friends with a pending invite, and the group room where its card was shared. The event carries
 * only the game and lobby; what each person may see is decided on fetch. Changes are coalesced per lobby (the first at
 * once, then one trailing send per PLAY_CHANGED_COALESCE_MS), since a Rhyme Match can score several words a second.
 *
 * The group room hears only changes a card could show (`card`): moves in a game under way change nothing on a card,
 * and up to a hundred members would refetch it every 300 ms. The game says which changes those are, since another
 * server may have sent the room's last event. Pending invites also expire here when their lobby starts, fills or is
 * called off (host and invitee are told), and count as accepted when the friend joined another way.
 */
export class PlayEvents {
  private readonly sources = new Map<PlayGame, (lobbyId: string) => Promise<LobbyFacts | null>>();
  private readonly windows = new Map<string, Window>();
  private readonly finishedListeners: Array<(game: PlayGame, lobbyId: string) => void> = [];
  private readonly coalesceMs: number;
  private readonly log: Log;
  private closed = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly notifier: PlayNotifier,
    opts: { coalesceMs?: number; log?: Log } = {},
  ) {
    this.coalesceMs = opts.coalesceMs ?? PLAY_CHANGED_COALESCE_MS;
    this.log = opts.log ?? { warn: () => undefined };
  }

  /** Where to read a game's lobbies from (each adapter's `facts`). */
  attach(game: PlayGame, facts: (lobbyId: string) => Promise<LobbyFacts | null>): void {
    this.sources.set(game, facts);
  }

  /**
   * Listens for finished games, for the badges, which count from committed tables. Told on each change that finds the
   * game finished, usually once or twice, so a listener must tolerate repeats; never awaited.
   */
  onFinished(listener: (game: PlayGame, lobbyId: string) => void): void {
    this.finishedListeners.push(listener);
  }

  /**
   * Reports a change in this lobby; never throws or waits. `also` names someone no longer in it who should hear this
   * once (a player just removed); `card: false` keeps it from the group room.
   */
  changed(game: PlayGame, lobbyId: string, opts: LobbyChange = {}): void {
    if (this.closed) return;
    const also = opts.also ?? [];
    const card = opts.card ?? true;
    if (this.coalesceMs <= 0) {
      void this.fanOut(game, lobbyId, also, card);
      return;
    }
    const key = `${game}:${lobbyId}`;
    const open = this.windows.get(key);
    if (open) {
      open.dirty = true;
      open.card ||= card;
      for (const id of also) open.also.add(id);
      return;
    }
    void this.fanOut(game, lobbyId, also, card);
    const timer = setTimeout(() => {
      const w = this.windows.get(key);
      this.windows.delete(key);
      if (w?.dirty) this.changed(game, lobbyId, { also: [...w.also], card: w.card });
    }, this.coalesceMs);
    timer.unref?.();
    this.windows.set(key, { timer, dirty: false, also: new Set(), card: false });
  }

  /** On shutdown: drop the trailing sends. */
  close(): void {
    this.closed = true;
    for (const w of this.windows.values()) clearTimeout(w.timer);
    this.windows.clear();
  }

  /** Tell one person (all their devices) about an invite or a rematch; never throws. */
  async tell(userId: string, event: PlayUserEvent): Promise<void> {
    await this.notifier.notifyUser(userId, event as unknown as Record<string, unknown>).catch((err) => {
      this.log.warn({ err, type: event.type }, 'play event not delivered');
    });
  }

  private async fanOut(game: PlayGame, lobbyId: string, also: readonly string[], card: boolean): Promise<void> {
    try {
      const source = this.sources.get(game);
      const facts = source ? await source(lobbyId) : null;
      if (facts?.phase === 'finished') {
        for (const listener of this.finishedListeners) {
          try {
            listener(game, lobbyId);
          } catch (err) {
            this.log.warn({ err, game, lobbyId }, 'a finished-game listener failed');
          }
        }
      }
      const pending = await this.pool.query<InviteRef>(
        `SELECT id, host_id, invitee_id, held FROM play_invites WHERE game = $1 AND lobby_id = $2 AND status = 'pending'`,
        [game, lobbyId],
      );
      const members = new Set(facts?.memberIds ?? []);
      const joined = pending.rows.filter((r) => members.has(r.invitee_id));
      if (joined.length > 0) await this.acceptJoined(joined.map((r) => r.id));
      // not a friend an invite is held from: they were never told of this lobby
      const waiting = pending.rows.filter((r) => !r.held && !members.has(r.invitee_id)).map((r) => r.invitee_id);
      const to = new Set([...members, ...waiting, ...also]);
      const event: PlayUserEvent = { type: 'play_changed', game, lobbyId };
      await Promise.all([...to].map((uid) => this.tell(uid, event)));
      // A move in a game under way changes nothing on a card or whether the lobby can be joined.
      if (!card) return;
      if (facts?.chatGroupId) {
        await this.notifier
          .publish(groupRoom(facts.chatGroupId), event as unknown as Record<string, unknown>)
          .catch((err) => this.log.warn({ err }, 'play_changed not published to the group'));
      }
      if (facts && (!facts.joinable || facts.activeIds.length >= facts.maxPlayers)) {
        await this.expireInvites(game, lobbyId);
      }
    } catch (err) {
      this.log.warn({ err, game, lobbyId }, 'play_changed failed');
    }
  }

  /** Invites whose friend is already in the lobby (via a card or link) are answered: the host sees "joined" and the banner goes. */
  private async acceptJoined(ids: readonly string[]): Promise<void> {
    const res = await this.pool.query<InviteRef>(
      `UPDATE play_invites SET status = 'accepted', responded_at = now()
        WHERE id = ANY($1::uuid[]) AND status = 'pending'
        RETURNING id, host_id, invitee_id, held`,
      [ids],
    );
    for (const r of res.rows) {
      const update: PlayUserEvent = { type: 'play_invite_update', inviteId: r.id, status: 'accepted' };
      await this.tell(r.host_id, update);
      if (!r.held) await this.tell(r.invitee_id, update);
    }
  }

  /**
   * A lobby that started (with no late joining), filled or was called off expires its pending invites, telling both
   * sides; a held invite's invitee never had a banner and is not told.
   */
  async expireInvites(game: PlayGame, lobbyId: string): Promise<void> {
    const res = await this.pool.query<InviteRef>(
      `UPDATE play_invites SET status = 'expired', responded_at = now()
        WHERE game = $1 AND lobby_id = $2 AND status = 'pending'
        RETURNING id, host_id, invitee_id, held`,
      [game, lobbyId],
    );
    for (const r of res.rows) {
      const update: PlayUserEvent = { type: 'play_invite_update', inviteId: r.id, status: 'expired' };
      await this.tell(r.host_id, update);
      if (!r.held) await this.tell(r.invitee_id, update);
    }
  }
}
