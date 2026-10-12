import type pg from 'pg';
import type { PlayGame, PlayUserEvent } from '@kurda/shared';
import { groupRoom } from '../groups/chat-service.js';
import type { LobbyFacts } from './types.js';

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
}

/**
 * `play_changed` (contract §B3): the event that replaced the clients' polling
 * every 1.5–1.8 s. Whenever a lobby or a game in it changes — someone joins,
 * leaves or is removed, it starts, a guess or a rhyme moves the scoreboard, it
 * ends, it is called off — everyone who would see that change is told to
 * fetch it: its players (still there or gone), the friends with a pending
 * invite to it, and — when it was shared into a group chat — the group's room,
 * where its card is. The event carries nothing but the game and the lobby; what
 * each person may see is decided when they fetch it.
 *
 * A Rhyme Match can score several words a second, so changes to one lobby are
 * coalesced: the first goes out at once, the rest in one trailing send per
 * PLAY_CHANGED_COALESCE_MS — the clients only ever refetch.
 *
 * It is also where pending invites learn that their lobby started, filled or
 * was called off: they expire then, and the host and the invitee are told.
 */
export class PlayEvents {
  private readonly sources = new Map<PlayGame, (lobbyId: string) => Promise<LobbyFacts | null>>();
  private readonly windows = new Map<string, Window>();
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
   * Something in this lobby changed. Never throws and never waits: telling
   * people is not part of what they did. `also` names someone no longer in it
   * who should hear about it this once (a player just removed, so their screen
   * finds out now rather than at its next slow poll).
   */
  changed(game: PlayGame, lobbyId: string, opts: { also?: readonly string[] } = {}): void {
    if (this.closed) return;
    const also = opts.also ?? [];
    if (this.coalesceMs <= 0) {
      void this.fanOut(game, lobbyId, also);
      return;
    }
    const key = `${game}:${lobbyId}`;
    const open = this.windows.get(key);
    if (open) {
      open.dirty = true;
      for (const id of also) open.also.add(id);
      return;
    }
    void this.fanOut(game, lobbyId, also);
    const timer = setTimeout(() => {
      const w = this.windows.get(key);
      this.windows.delete(key);
      if (w?.dirty) this.changed(game, lobbyId, { also: [...w.also] });
    }, this.coalesceMs);
    timer.unref?.();
    this.windows.set(key, { timer, dirty: false, also: new Set() });
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

  private async fanOut(game: PlayGame, lobbyId: string, also: readonly string[]): Promise<void> {
    try {
      const source = this.sources.get(game);
      const facts = source ? await source(lobbyId) : null;
      const pending = await this.pool.query<{ invitee_id: string }>(
        `SELECT invitee_id FROM play_invites WHERE game = $1 AND lobby_id = $2 AND status = 'pending'`,
        [game, lobbyId],
      );
      const to = new Set([...(facts?.memberIds ?? []), ...pending.rows.map((r) => r.invitee_id), ...also]);
      const event: PlayUserEvent = { type: 'play_changed', game, lobbyId };
      await Promise.all([...to].map((uid) => this.tell(uid, event)));
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

  /**
   * A lobby that started (and cannot be joined late), filled up, or was called
   * off takes its pending invites with it; both sides are told, so the
   * invitee's banner goes and the host's list says "expired".
   */
  async expireInvites(game: PlayGame, lobbyId: string): Promise<void> {
    const res = await this.pool.query<{ id: string; host_id: string; invitee_id: string }>(
      `UPDATE play_invites SET status = 'expired', responded_at = now()
        WHERE game = $1 AND lobby_id = $2 AND status = 'pending'
        RETURNING id, host_id, invitee_id`,
      [game, lobbyId],
    );
    for (const r of res.rows) {
      const update: PlayUserEvent = { type: 'play_invite_update', inviteId: r.id, status: 'expired' };
      await this.tell(r.host_id, update);
      await this.tell(r.invitee_id, update);
    }
  }
}
