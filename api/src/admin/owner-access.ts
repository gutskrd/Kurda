import type pg from 'pg';
import { parseAdminEmails } from './bootstrap-admins.js';
import { isPrivileged } from './roles.js';

/**
 * Who may use the admin console at all: the accounts whose addresses are
 * listed in ADMIN_ACCESS_EMAILS (or, when that is not set, BOOTSTRAP_ADMIN_EMAILS),
 * and no one else, whatever roles anyone else holds.
 *
 * A staff role alone used to be enough. Roles are data, though: a mistaken
 * grant, a leftover moderator, or a database row written by something that
 * should not have written it would each have opened the console. Tying it to a
 * short list kept in configuration (never in this repository, which is public)
 * means that even then the console stays shut to everyone but the owner.
 *
 * Every condition must hold:
 * - the address is on the list, compared without regard to case;
 * - the account has CONFIRMED that address, so registering someone else's
 *   address proves nothing;
 * - it holds a staff role (roles.ts), so the list cannot elevate on its own;
 * - it is neither deleted nor banned.
 *
 * To anyone else the console's sign-in answers exactly as a wrong password does
 * (auth/routes.ts), and every staff route answers exactly as a route that does
 * not exist (admin-gate.ts): nothing says the account was right, that it is
 * not staff, or that the route is there.
 *
 * In production an empty list shuts the console to everyone, rather than
 * falling back to roles alone; outside production it does fall back, so a
 * development database and the tests work without one.
 */
export interface AccessConfig {
  ADMIN_ACCESS_EMAILS: string;
  BOOTSTRAP_ADMIN_EMAILS: string;
  NODE_ENV: string;
}

interface AccountRow {
  email: string | null;
  email_verified_at: Date | null;
  roles: string[];
  deleted_at: Date | null;
  banned_at: Date | null;
}

export class AdminAccess {
  /** the listed addresses, lower case; null outside production with none listed, where roles alone decide */
  private readonly emails: ReadonlySet<string> | null;

  constructor(private readonly pool: pg.Pool, config: AccessConfig) {
    const listed = parseAdminEmails(config.ADMIN_ACCESS_EMAILS.trim() ? config.ADMIN_ACCESS_EMAILS : config.BOOTSTRAP_ADMIN_EMAILS);
    this.emails = listed.length > 0 ? new Set(listed) : config.NODE_ENV === 'production' ? new Set() : null;
  }

  /** True when no account at all can use the console: production, with no addresses listed. */
  get shut(): boolean {
    return this.emails !== null && this.emails.size === 0;
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
