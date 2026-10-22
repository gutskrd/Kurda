import type pg from 'pg';
import { parseAdminEmails } from './bootstrap-admins.js';
import { isPrivileged } from './roles.js';

/**
 * Who may use the admin console at all: the staff, and no one else.
 *
 * Staff means an account holding a staff role (roles.ts) that is neither
 * deleted nor banned. Roles are only ever given through BOOTSTRAP_ADMIN_EMAILS
 * or by hand in the database, so this is the owner and the admins they made.
 *
 * ADMIN_ACCESS_EMAILS, when set, is a second lock on top: only the accounts
 * whose CONFIRMED address is on it may use the console, whatever roles anyone
 * else holds. A mistaken grant, a leftover moderator or a row written by
 * something that should not have written it then opens nothing either. It
 * lives in configuration only, never in this repository, which is public. Left
 * unset, roles alone decide, so no admin is shut out by a list nobody wrote.
 *
 * To anyone else the console's sign-in answers exactly as a wrong password does
 * (auth/routes.ts), and every staff route answers exactly as a route that does
 * not exist (admin-gate.ts): nothing says the account was right, that it is
 * not staff, or that the route is there.
 */
export interface AccessConfig {
  ADMIN_ACCESS_EMAILS: string;
}

interface AccountRow {
  email: string | null;
  email_verified_at: Date | null;
  roles: string[];
  deleted_at: Date | null;
  banned_at: Date | null;
}

export class AdminAccess {
  /** the listed addresses, lower case; null when none are listed, and roles alone decide */
  private readonly emails: ReadonlySet<string> | null;

  constructor(private readonly pool: pg.Pool, config: AccessConfig) {
    const listed = parseAdminEmails(config.ADMIN_ACCESS_EMAILS);
    this.emails = listed.length > 0 ? new Set(listed) : null;
  }

  /** Whether a list of addresses narrows the console beyond the staff roles. */
  get listed(): boolean {
    return this.emails !== null;
  }

  /** Whether an account, as read from the database, may use the console. */
  allowsAccount(account: AccountRow): boolean {
    if (!isPrivileged(account.roles) || account.deleted_at || account.banned_at) return false;
    if (this.emails === null) return true;
    return account.email !== null && account.email_verified_at !== null && this.emails.has(account.email.toLowerCase());
  }

  /**
   * Whether the account `userId` may use the console, read afresh on every
   * staff request (one row by its key): a revoked role, a ban or a changed
   * address shuts the console at once, and a grant opens it at once.
   */
  async allows(userId: string): Promise<boolean> {
    const { rows } = await this.pool.query<AccountRow>(
      `SELECT email, email_verified_at, roles, deleted_at, banned_at FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0] ? this.allowsAccount(rows[0]) : false;
  }
}
