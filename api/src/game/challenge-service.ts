import type { RealtimeKV } from '../realtime/kv.js';
import { AppError } from '../plugins/errors.js';
import type { GameMode } from './modes.js';

/** Direct challenges expire after this window (KUR-088). */
export const CHALLENGE_TTL_SECONDS = 120;

/** Minimal seams so the service is unit-testable without the full app. */
export interface ChallengeMatchmaker {
  createDirectMatch(userIds: string[], mode: GameMode, opts?: { ranked?: boolean }): Promise<{ roomId: string }>;
}
export interface ChallengeNotifier {
  notifyUser(userId: string, event: Record<string, unknown>): Promise<void>;
}
export interface FriendCheck {
  statusBetween(a: string, b: string): Promise<string>;
}

export interface ChallengeStatus {
  /** you have a pending challenge out to them */
  outgoing: boolean;
  /** they have a pending challenge out to you */
  incoming: boolean;
}

export type ChallengeResult =
  | { status: 'pending' }
  | { status: 'matched'; roomId: string };

/**
 * Challenge a friend (KUR-088). A direct, unranked 1v1 invite held in the
 * realtime KV with a 2-minute TTL; both parties are pushed live status over the
 * gateway. Accept mints an unranked room; declines are polite (no reason). When
 * two friends invite each other at once, the second invite short-circuits to a
 * single shared room instead of creating two.
 */
export class ChallengeService {
  constructor(
    private readonly kv: RealtimeKV,
    private readonly matchmaking: ChallengeMatchmaker,
    private readonly notifier: ChallengeNotifier,
    private readonly friends: FriendCheck,
  ) {}

  private key(from: string, to: string): string {
    return `challenge:${from}:${to}`;
  }

  private async requireFriends(a: string, b: string): Promise<void> {
    if (a === b) throw new AppError('SELF_CHALLENGE', 400, 'you cannot challenge yourself');
    if ((await this.friends.statusBetween(a, b)) !== 'friends') {
      throw new AppError('NOT_FRIENDS', 403, 'you can only challenge friends');
    }
  }

  private async startMatch(a: string, b: string): Promise<string> {
    const record = await this.matchmaking.createDirectMatch([a, b], '1v1', { ranked: false });
    await this.kv.del(this.key(a, b));
    await this.kv.del(this.key(b, a));
    return record.roomId;
  }

  /** Send a challenge (auto-matches if they already challenged you). */
  async challenge(from: string, to: string): Promise<ChallengeResult> {
    await this.requireFriends(from, to);

    // they already invited me → merge into one room instead of two (edge case)
    if (await this.kv.get(this.key(to, from))) {
      const roomId = await this.startMatch(from, to);
      await this.notifier.notifyUser(from, { type: 'challenge_accepted', roomId }).catch(() => undefined);
      await this.notifier.notifyUser(to, { type: 'challenge_accepted', roomId }).catch(() => undefined);
      return { status: 'matched', roomId };
    }

    await this.kv.set(
      this.key(from, to),
      JSON.stringify({ from, to, createdAt: Date.now() }),
      CHALLENGE_TTL_SECONDS,
    );
    await this.notifier.notifyUser(to, { type: 'challenge_invite', from }).catch(() => undefined);
    return { status: 'pending' };
  }

  /** Accept a pending challenge from `fromId`; mints an unranked 1v1 room. */
  async accept(userId: string, fromId: string): Promise<{ roomId: string }> {
    if (!(await this.kv.get(this.key(fromId, userId)))) {
      throw new AppError('NO_CHALLENGE', 404, 'no pending challenge (it may have expired)');
    }
    const roomId = await this.startMatch(fromId, userId);
    await this.notifier.notifyUser(fromId, { type: 'challenge_accepted', by: userId, roomId }).catch(() => undefined);
    await this.notifier.notifyUser(userId, { type: 'challenge_accepted', roomId }).catch(() => undefined);
    return { roomId };
  }

  /** Decline a challenge — polite, no reason surfaced. */
  async decline(userId: string, fromId: string): Promise<void> {
    await this.kv.del(this.key(fromId, userId));
    await this.notifier.notifyUser(fromId, { type: 'challenge_declined', by: userId }).catch(() => undefined);
  }

  /** Withdraw a challenge you sent. */
  async cancel(from: string, to: string): Promise<void> {
    await this.kv.del(this.key(from, to));
    await this.notifier.notifyUser(to, { type: 'challenge_cancelled', from }).catch(() => undefined);
  }

  /** Live status between the caller and another user (for polling fallback). */
  async status(userId: string, otherId: string): Promise<ChallengeStatus> {
    const [outgoing, incoming] = await Promise.all([
      this.kv.get(this.key(userId, otherId)),
      this.kv.get(this.key(otherId, userId)),
    ]);
    return { outgoing: outgoing !== null, incoming: incoming !== null };
  }
}
