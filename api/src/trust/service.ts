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
  /** the account was auto-muted/suspended by this message */
  enforced: boolean;
}

/**
 * New-account trust levels + velocity limits + spam auto-suspension (KUR-295).
 * Orchestrates the pure cores (`levels.ts`, `spam.ts`) at the write boundary:
 * computes a per-request trust level from account facts, enforces per-level
 * action velocity caps (rolling counts in Redis), and detects duplicate/burst
 * spam — auto-muting or auto-suspending (ban, which revokes sessions) obvious
 * bots. Both are automatic sanctions now: the person gets the statement of
 * reasons (marked automatic, not yet reviewed by a person), sees it on their
 * standing page and can ask for a review; the enforced columns and the
 * `admin_actions` row (admin_id NULL) come from the sanctions service, so it is
 * visible + reversible (#101/#104) like any other.
 *
 * Without Redis the velocity/spam signals read as empty (fail-open) — enforced
 * in the integration environment where Redis is configured.
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

  /** Effective trust level from account age + verification + violation history. */
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

  /** Whether one more `action` is allowed for the user right now (no increment). */
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
   * Assess a message for duplicate/burst spam and apply the graduated response.
   * Mute/suspend are enforced immediately (so the offending message is the last
   * one that lands) and logged; `queueForReview` is surfaced for the #102 queue
   * (wired when that lands).
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
   * Spam lands wherever text does, so the mute covers both: messages (a chat
   * mute) and posts and comments (a post mute), for the same hour. One notice
   * says so; a second sanction is recorded without repeating it. Each is skipped
   * while one of its kind is already in force — one sanction and one notice per
   * incident, not one per message — so someone an admin muted in chat who now
   * spams the library is still stopped there.
   */
  private async autoMute(userId: string): Promise<void> {
    const kinds = (
      await Promise.all([
        activeRestriction(this.pool, userId, 'chat').then((r) => (r ? null : ('chat_mute' as const))),
        activeRestriction(this.pool, userId, 'post').then((r) => (r ? null : ('post_mute' as const))),
      ])
    ).filter((k): k is 'chat_mute' | 'post_mute' => k !== null);
    if (kinds.length === 0) return;
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
      for (const [i, kind] of kinds.entries()) await this.sanctions.apply(client, { ...common, kind, notify: i === 0 });
    });
  }

  /** A day's suspension: ban + every live session revoked (KUR-016), as an automatic sanction. */
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
