import { PRESENCE_TIMEOUT_SECONDS } from '@kurda/shared';

/** last_seen_at is written at most this often per player. */
export const PRESENCE_WRITE_EVERY_MS = 15_000;

export interface PresenceOptions {
  /** how long a member may be silent before they are away */
  timeoutMs?: number;
  /** after a process start everyone counts as present this long (nobody's polls reached us yet) */
  startGraceMs?: number;
  now?: () => number;
}

/**
 * Who is still at the game: every request a member makes refreshes them here,
 * in memory, and — at most every 15 s — in `story_game_players.last_seen_at`,
 * so another instance (or this one after a restart) can tell too.
 *
 * Presence is why a closed tab cannot stall a game. Someone not heard from for
 * PRESENCE_TIMEOUT_SECONDS is away: not waited for while reading, answering or
 * continuing, not counted towards starting, and — when it is the host — not
 * holding the host controls. Clients poll at least every 20 s, so a present
 * player is never mistaken for an away one. Coming back is just another
 * request: they are present again, seat and score as they were.
 *
 * Right after a process starts this instance has heard from nobody, and the
 * database copy may be up to 15 s old; for the first PRESENCE_TIMEOUT_SECONDS
 * everyone counts as present, rather than everyone as away.
 */
export class Presence {
  private readonly seen = new Map<string, Map<string, number>>();
  private readonly written = new Map<string, number>();
  private readonly timeoutMs: number;
  private readonly startedAt: number;
  private readonly startGraceMs: number;
  readonly now: () => number;

  constructor(opts: PresenceOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? PRESENCE_TIMEOUT_SECONDS * 1000;
    this.startGraceMs = opts.startGraceMs ?? this.timeoutMs;
    this.startedAt = this.now();
  }

  /**
   * Record a request from a member. Returns whether the database copy is due
   * a write (the caller writes it), and whether they had been away until now.
   */
  touch(gameId: string, userId: string, dbSeenAt: Date | null = null): { write: boolean; wasAway: boolean } {
    const now = this.now();
    const wasAway = this.isAway(gameId, userId, dbSeenAt, now);
    let game = this.seen.get(gameId);
    if (!game) this.seen.set(gameId, (game = new Map()));
    game.set(userId, now);
    const key = `${gameId}:${userId}`;
    const last = this.written.get(key) ?? 0;
    const write = now - last >= PRESENCE_WRITE_EVERY_MS;
    if (write) this.written.set(key, now);
    return { write, wasAway };
  }

  /** When this member was last heard from, here or (per `dbSeenAt`) anywhere. */
  seenAt(gameId: string, userId: string, dbSeenAt: Date | null): number {
    const mem = this.seen.get(gameId)?.get(userId) ?? 0;
    return Math.max(mem, dbSeenAt ? dbSeenAt.getTime() : 0);
  }

  isAway(gameId: string, userId: string, dbSeenAt: Date | null, now = this.now()): boolean {
    if (now - this.startedAt < this.startGraceMs) return false;
    return now - this.seenAt(gameId, userId, dbSeenAt) > this.timeoutMs;
  }

  /** The instant this member turns away if nothing more is heard from them. */
  awayAt(gameId: string, userId: string, dbSeenAt: Date | null): number {
    return Math.max(this.seenAt(gameId, userId, dbSeenAt) + this.timeoutMs, this.startedAt + this.startGraceMs) + 1;
  }

  /** Forget a game that has ended. */
  drop(gameId: string): void {
    const game = this.seen.get(gameId);
    if (!game) return;
    for (const userId of game.keys()) this.written.delete(`${gameId}:${userId}`);
    this.seen.delete(gameId);
  }

  /** Forget everything older than `maxAgeMs` (the housekeeping sweep). */
  prune(maxAgeMs: number): void {
    const cutoff = this.now() - maxAgeMs;
    for (const [gameId, game] of this.seen) {
      for (const [userId, at] of game) {
        if (at < cutoff) {
          game.delete(userId);
          this.written.delete(`${gameId}:${userId}`);
        }
      }
      if (game.size === 0) this.seen.delete(gameId);
    }
  }

  /** Test seam: pretend a member was last heard from at `at`. */
  setSeenForTest(gameId: string, userId: string, at: number): void {
    let game = this.seen.get(gameId);
    if (!game) this.seen.set(gameId, (game = new Map()));
    game.set(userId, at);
  }
}
