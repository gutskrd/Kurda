import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { verifyPassword } from '../auth/service.js';
import { emailLocaleFor } from '../email/templates.js';
import { sendEmailJob } from '../jobs/email.js';
import type { JobQueue } from '../jobs/queue.js';
import type { SecurityRecorder } from '../security/log.js';
import { USERNAME_ERROR_MESSAGE, validateUsername, type UsernameError } from './username.js';

/**
 * Changing a username (POST /me/username), and what a person is told before
 * they try (GET /me/username, GET /me/username/available).
 *
 * A username is how other people find and recognise an account, so changing
 * one is treated as a change to the account, not to the profile:
 *
 * - the current password is asked for again, as it is for a new password. A
 *   phone left unlocked on a table should not be enough to become somebody
 *   else to that person's friends. An account that signs in through another
 *   service has no password to ask for; its session is all it has, and the
 *   other limits here are what stand in for it;
 * - one change every USERNAME_CHANGE_COOLDOWN_DAYS. A change of capitals alone
 *   (azad → Azad) is the same name to everyone and spends nothing;
 * - the name given up is held for its last owner for USERNAME_HOLD_DAYS, twice
 *   the wait, so there are thirty days in which they can have it back and
 *   nobody else can. The database keeps that rule for every way a username is
 *   set (migration username-history);
 * - every change, and every wrong password on the way to one, is written in
 *   the security log, and the owner is told by email at their confirmed
 *   address, with the old name and what to do if it was not them.
 *
 * Whether a name is taken or only held is not said apart: both answer TAKEN.
 */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
export const USERNAME_HOLD_DAYS = 60;
const DAY_MS = 24 * 3_600_000;

/** What the settings show before a change is tried. */
export interface UsernameStatus {
  username: string;
  /** whether the current password has to be given (false for an account that signs in through another service only) */
  needsPassword: boolean;
  canChange: boolean;
  /** when the next change may be made; null when one may be made now */
  availableAt: string | null;
  cooldownDays: number;
  holdDays: number;
  /** the names this account gave up that are still kept for it, the latest first */
  held: Array<{ username: string; heldUntil: string }>;
}

/** Whether a name could be taken now, and if not, why in terms a form can say. */
export type UsernameAvailability = { available: true; username: string } | { available: false; reason: UsernameError | 'taken' | 'same' };

interface Deps {
  jobs?: JobQueue | null;
  security?: SecurityRecorder | null;
  log?: { warn: (obj: unknown, msg: string) => void };
}

interface AccountRow {
  username: string;
  username_changed_at: Date | null;
  password_hash: string | null;
  email: string | null;
  email_verified_at: Date | null;
  locale: string;
}

const isHeldOrTaken = (err: unknown): boolean => {
  const constraint = (err as { constraint?: string }).constraint;
  return constraint === 'users_username_active_uniq' || constraint === 'users_username_held';
};

export class UsernameChangeService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: Deps = {},
  ) {}

  private availableAt(changedAt: Date | null): Date | null {
    if (!changedAt) return null;
    const at = new Date(new Date(changedAt).getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS);
    return at.getTime() > Date.now() ? at : null;
  }

  async status(userId: string): Promise<UsernameStatus> {
    const found = await this.pool.query<AccountRow>(
      `SELECT username, username_changed_at, password_hash, email, email_verified_at, locale FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const row = found.rows[0];
    if (!row) throw new AppError('UNAUTHORIZED', 401, 'authentication required');
    const held = await this.pool.query<{ username: string; held_until: Date }>(
      `SELECT username, held_until FROM username_history WHERE user_id = $1 AND held_until > now() ORDER BY changed_at DESC LIMIT 10`,
      [userId],
    );
    const availableAt = this.availableAt(row.username_changed_at);
    return {
      username: row.username,
      needsPassword: row.password_hash !== null,
      canChange: availableAt === null,
      availableAt: availableAt?.toISOString() ?? null,
      cooldownDays: USERNAME_CHANGE_COOLDOWN_DAYS,
      holdDays: USERNAME_HOLD_DAYS,
      held: held.rows.map((h) => ({ username: h.username, heldUntil: new Date(h.held_until).toISOString() })),
    };
  }

  /** Whether `raw` could be this account's username now: well formed, not in use, and not held for somebody else. */
  async available(userId: string, raw: string): Promise<UsernameAvailability> {
    const checked = validateUsername(raw);
    if (!checked.ok) return { available: false, reason: checked.reason };
    const mine = await this.pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
    if (mine.rows[0]?.username === checked.value) return { available: false, reason: 'same' };
    const taken = await this.pool.query(
      `SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL AND id <> $2
       UNION ALL
       SELECT 1 FROM username_history h JOIN users u ON u.id = h.user_id
        WHERE h.username = $1 AND h.held_until > now() AND h.user_id <> $2 AND u.deleted_at IS NULL
       LIMIT 1`,
      [checked.value, userId],
    );
    return (taken.rowCount ?? 0) > 0 ? { available: false, reason: 'taken' } : { available: true, username: checked.value };
  }

  /**
   * The change. Answers the username the account has afterwards and whether
   * it changed. The password is checked before anything is locked; the wait
   * is then read again on the locked row, so two requests at once make one
   * change and one refusal.
   */
  async change(userId: string, raw: string, currentPassword: string | undefined): Promise<{ username: string; changed: boolean }> {
    const checked = validateUsername(raw);
    if (!checked.ok) throw new AppError('INVALID_USERNAME', 400, USERNAME_ERROR_MESSAGE[checked.reason], { reason: checked.reason });
    const next = checked.value;

    const found = await this.pool.query<AccountRow>(
      `SELECT username, username_changed_at, password_hash, email, email_verified_at, locale FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const account = found.rows[0];
    if (!account) throw new AppError('UNAUTHORIZED', 401, 'authentication required');
    if (account.password_hash !== null) {
      if (!currentPassword) throw new AppError('PASSWORD_REQUIRED', 400, 'the current password is needed to change a username');
      if (!(await verifyPassword(account.password_hash, currentPassword))) {
        await this.deps.security?.record('username.change_failed', { userId });
        throw new AppError('WRONG_PASSWORD', 400, 'the current password is not correct');
      }
    }

    const client = await this.pool.connect();
    let previous: string;
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ username: string; username_changed_at: Date | null }>(
        `SELECT username, username_changed_at FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [userId],
      );
      const row = locked.rows[0];
      if (!row) throw new AppError('UNAUTHORIZED', 401, 'authentication required');
      previous = row.username;
      if (previous === next) {
        await client.query('ROLLBACK');
        return { username: previous, changed: false };
      }
      // the same name in other capitals is the same name to everybody else: written as asked, and nothing is spent
      if (previous.toLowerCase() === next.toLowerCase()) {
        await client.query(`UPDATE users SET username = $2 WHERE id = $1`, [userId, next]);
        await client.query('COMMIT');
        return { username: next, changed: true };
      }
      const availableAt = this.availableAt(row.username_changed_at);
      if (availableAt) {
        throw new AppError('USERNAME_CHANGE_COOLDOWN', 429, `You can change your username again on ${availableAt.toISOString().slice(0, 10)}.`, {
          availableAt: availableAt.toISOString(),
          cooldownDays: USERNAME_CHANGE_COOLDOWN_DAYS,
          retryAfterSec: Math.ceil((availableAt.getTime() - Date.now()) / 1_000),
        });
      }
      await client.query(`UPDATE users SET username = $2, username_changed_at = now() WHERE id = $1`, [userId, next]);
      // a name of their own taken back is theirs again, not one they used to have
      await client.query(`DELETE FROM username_history WHERE user_id = $1 AND username = $2`, [userId, next]);
      await client.query(`INSERT INTO username_history (user_id, username, held_until) VALUES ($1, $2, now() + make_interval(days => $3))`, [
        userId,
        previous,
        USERNAME_HOLD_DAYS,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isHeldOrTaken(err)) throw new AppError('USERNAME_TAKEN', 409, 'username already in use');
      throw err;
    } finally {
      client.release();
    }

    await this.deps.security?.record('username.changed', { userId, details: { from: previous, to: next } });
    await this.notify(account, previous, next);
    return { username: next, changed: true };
  }

  /** The owner is told at the address they have shown to be theirs. Best-effort: the change does not wait on the mail. */
  private async notify(account: AccountRow, previous: string, next: string): Promise<void> {
    if (!this.deps.jobs || account.email === null || account.email_verified_at === null) return;
    try {
      await this.deps.jobs.enqueue(sendEmailJob, {
        to: account.email,
        template: 'username-changed',
        vars: {
          username: next,
          previous,
          holdDays: String(USERNAME_HOLD_DAYS),
          cooldownDays: String(USERNAME_CHANGE_COOLDOWN_DAYS),
          time: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        },
        locale: emailLocaleFor(account.locale),
      });
    } catch (err) {
      this.deps.log?.warn({ err }, 'failed to queue the notice of a username change');
    }
  }
}
