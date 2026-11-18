import type pg from 'pg';
import type { Redis } from 'ioredis';
import {
  checkActionAllowed,
  getTrustLevel,
  VELOCITY_CAPS,
  VELOCITY_WINDOW_MS,
  type ActionAllowance,
  type ThrottledAction,
  type TrustLevel,
} from './levels.js';
import { countNearIdentical, evaluateSpam, type AbuseAction } from './spam.js';
import { SanctionsService, activeRestriction } from '../moderation/sanctions-service.js';
import { inTransaction } from '../moderation/tx.js';

/** Auto-mute / auto-suspend durations. */
export const AUTO_MUTE_MS = 60 * 60 * 1000; // 1 hour
export const AUTO_SUSPEND_MS = 24 * 60 * 60 * 1000; // 1 day

/** What the person is told: what we saw, what it means, that it ends by itself. */
const AUTO_MUTE_STATEMENT =
  "We noticed the same message or post many times in a short while, which looks like spam. For an hour you can't send messages, post or comment. After that, everything works again.";
const AUTO_SUSPEND_STATEMENT =
  'We kept seeing the same message or post again and again, which looks like spam, so your account is paused for a day.';
/** Rolling window for burst/duplicate content tracking. */
export const BURST_WINDOW_MS = 60 * 1000;
const RECENT_CONTENT_MAX = 50;

export interface TrustCheck extends ActionAllowance {
  level: TrustLevel;
}

export interface SpamOutcome {
  action: AbuseAction;
  queueForReview: boolean;
  /** The account was automatically muted or suspended by this message. */
  enforced: boolean;
}

/**
 * New-account trust levels, velocity limits and spam auto-suspension at the write boundary, using the pure cores
 * (`levels.ts`, `spam.ts`): a per-request trust level, per-level action caps on rolling Redis counts, and duplicate and
 * burst spam detection that mutes or suspends obvious bots. Both are automatic sanctions through the sanctions service:
 * the person gets a statement of reasons, sees it on their standing page and can ask for review, and an `admin_actions`
 * row records it, visible and reversible. Without Redis the signals read empty and fail open.
 */
export class TrustService {
  private readonly pool: pg.Pool;
  private readonly redis?: Redis;
  private readonly now: () => Date;
  private readonly sanctions: SanctionsService;

  constructor(pool: pg.Pool, deps: { redis?: Redis; now?: () => Date } = {}) {
    this.pool = pool;
    this.redis = deps.redis;
    this.now = deps.now ?? (() => new Date());
    this.sanctions = new SanctionsService(pool);
  }

  /** The effective trust level from account age, verification and violation history. */
  async getLevel(userId: string): Promise<TrustLevel> {
    const res = await this.pool.query<{
      created_at: Date;
      email_verified_at: Date | null;
      phone_verified_at: Date | null;
      violations: string;
    }>(
      `SELECT u.created_at, u.email_verified_at, u.phone_verified_at,
              (SELECT COUNT(*) FROM admin_actions a
               WHERE a.target_user_id = u.id
                 AND a.action IN ('mute','temp_ban','perm_ban','auto_mute','auto_suspend')) AS violations
       FROM users u WHERE u.id = $1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return 'new';
    return getTrustLevel({
      accountAgeMs: Math.max(0, this.now().getTime() - row.created_at.getTime()),
      emailVerified: row.email_verified_at !== null,
      phoneVerified: row.phone_verified_at !== null, // fast-tracks trust (#297)
      priorViolations: Number(row.violations),
    });
  }

  /** Whether one more `action` is allowed now, without counting it. */
  async checkAction(userId: string, action: ThrottledAction): Promise<TrustCheck> {
    const level = await this.getLevel(userId);
    const count = await this.recentCount(userId, action);
    return { level, ...checkActionAllowed(level, action, count) };
  }

  /** Caps for a level (for surfacing to the client via /me/trust). */
  capsFor(level: TrustLevel): Record<ThrottledAction, number> {
    return VELOCITY_CAPS[level];
  }

  /** Count this action toward the rolling window (call after it succeeds). */
  async recordAction(userId: string, action: ThrottledAction): Promise<void> {
    if (!this.redis) return;
    const key = this.velocityKey(userId, action);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, VELOCITY_WINDOW_MS);
  }

  /**
   * Assesses a message for duplicate or burst spam and applies the graduated response. Mute and suspend are enforced at
   * once, so the offending message is the last to land, and logged; `queueForReview` marks the account for review.
   */
  async assessContent(userId: string, text: string): Promise<SpamOutcome> {
    const recent = await this.recentContent(userId);
    const verdict = evaluateSpam({
      repeatCount: countNearIdentical(recent, text),
      burstCount: recent.length + 1,
    });
    await this.pushContent(userId, text);

    let enforced = false;
    if (verdict.action === 'mute') {
      await this.autoMute(userId);
      enforced = true;
    } else if (verdict.action === 'suspend') {
      await this.autoSuspend(userId);
      enforced = true;
    }
    return { action: verdict.action, queueForReview: verdict.queueForReview, enforced };
  }

  // ---- enforcement ----------------------------------------------------------

  /**
   * Spam lands wherever text does, so the mute covers messages (chat) and posts and comments (post) for the same hour,
   * with one notice. Each is skipped while one of its kind is in force, so one incident is one sanction, and someone an
   * admin already muted in chat is still stopped in the library. It runs under the person's lock, so a burst mutes once.
   */
  private async autoMute(userId: string): Promise<void> {
    const common = {
      userId,
      policy: 'spam' as const,
      statement: AUTO_MUTE_STATEMENT,
      internalNote: 'spam: repeated/burst content',
      durationHours: AUTO_MUTE_MS / 3_600_000,
      createdBy: null,
      origin: 'automatic' as const,
      auditAction: 'auto_mute',
    };
    await inTransaction(this.pool, async (client) => {
      if (!(await this.sanctions.lockPerson(client, userId))) return;
      const kinds: Array<'chat_mute' | 'post_mute'> = [];
      if (!(await activeRestriction(client, userId, 'chat'))) kinds.push('chat_mute');
      if (!(await activeRestriction(client, userId, 'post'))) kinds.push('post_mute');
      for (const [i, kind] of kinds.entries()) await this.sanctions.apply(client, { ...common, kind, notify: i === 0 });
    });
  }

  /** A day's suspension, a ban with every live session revoked, as an automatic sanction. */
  private async autoSuspend(userId: string): Promise<void> {
    await inTransaction(this.pool, (client) =>
      this.sanctions.apply(client, {
        userId,
        kind: 'suspension',
        policy: 'spam',
        statement: AUTO_SUSPEND_STATEMENT,
        internalNote: 'spam: repeated/burst content',
        durationHours: AUTO_SUSPEND_MS / 3_600_000,
        createdBy: null,
        origin: 'automatic',
        auditAction: 'auto_suspend',
      }),
    );
  }

  // ---- Redis-backed rolling signals -----------------------------------------

  private velocityKey(userId: string, action: ThrottledAction): string {
    const bucket = Math.floor(this.now().getTime() / VELOCITY_WINDOW_MS);
    return `trust:vel:${action}:${userId}:${bucket}`;
  }

  private async recentCount(userId: string, action: ThrottledAction): Promise<number> {
    if (!this.redis) return 0;
    const raw = await this.redis.get(this.velocityKey(userId, action));
    return raw ? Number(raw) : 0;
  }

  private recentContentKey(userId: string): string {
    return `trust:recent:${userId}`;
  }

  private async recentContent(userId: string): Promise<string[]> {
    if (!this.redis) return [];
    return this.redis.lrange(this.recentContentKey(userId), 0, RECENT_CONTENT_MAX - 1);
  }

  private async pushContent(userId: string, text: string): Promise<void> {
    if (!this.redis) return;
    const key = this.recentContentKey(userId);
    await this.redis.lpush(key, text);
    await this.redis.ltrim(key, 0, RECENT_CONTENT_MAX - 1);
    await this.redis.pexpire(key, BURST_WINDOW_MS);
  }
}
