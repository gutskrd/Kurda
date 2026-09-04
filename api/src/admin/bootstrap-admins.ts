import type pg from 'pg';
import { AuditService } from './audit-service.js';

/**
 * Bootstrap admin grants (BOOTSTRAP_ADMIN_EMAILS).
 *
 * The first admin cannot be created through the admin panel — something has to
 * grant it — so the API reconciles a configured allowlist of addresses on every
 * boot. Deliberate properties:
 *
 * - **Bound to proven control of the mailbox, not to the address.** A grant only
 *   happens once the account has CONFIRMED its email, so registering someone
 *   else's address is not enough: the code sent to that inbox must have been
 *   entered. An unverified match is refused and logged, not granted later by
 *   accident — it is re-evaluated on the next boot.
 * - **Addresses live in configuration, never in the repository.** This repo is
 *   public; committing them would publish exactly which accounts to attack.
 * - **Never revokes.** Removing an address stops future grants but will not strip
 *   a role, so a config slip can't lock everyone out of the panel. Revoke
 *   deliberately, from the panel or the database.
 * - **Skips deleted and banned accounts**, so a disabled account can't be
 *   silently re-elevated.
 * - **Audited.** Every grant is written to the append-only admin audit log in the
 *   same transaction as the role change: if the audit write fails, the grant
 *   rolls back, so there is no unlogged elevation.
 *
 * Holding the role is still not sufficient on its own — sensitive admin routes
 * additionally require enrolled TOTP 2FA (see `requireAdmin`).
 */

/**
 * Granting both is intentional. `superadmin` is the RBAC role the admin app's
 * capability checks use, while a large number of older routes (moderation,
 * economy, events, experiments, fraud, analytics, tournaments, …) still accept
 * only the legacy `admin`. Without both, half the panel answers 403.
 */
export const BOOTSTRAP_ADMIN_ROLES = ['admin', 'superadmin'] as const;

/** No human performed a bootstrap grant; the audit row records the system. */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export interface BootstrapLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export interface BootstrapResult {
  granted: string[];
  /** matched an account that has not confirmed its email — refused */
  unverified: string[];
  /** no account owns the address (yet) */
  missing: string[];
  /** already held the roles, or the account is deleted/banned */
  skipped: string[];
}

/** Split the configured list; blank entries and casing are tolerated. */
export function parseAdminEmails(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

interface UserRow {
  id: string;
  roles: string[];
  email_verified_at: Date | null;
  deleted_at: Date | null;
  banned_at: Date | null;
}

/**
 * Reconcile the configured admin allowlist. Safe to run on every boot: it is
 * idempotent, and an address that isn't ready yet (no account, or unverified) is
 * simply picked up on a later start once it is.
 */
export async function grantBootstrapAdmins(
  pool: pg.Pool,
  rawEmails: string,
  log: BootstrapLogger,
): Promise<BootstrapResult> {
  const result: BootstrapResult = { granted: [], unverified: [], missing: [], skipped: [] };
  const emails = parseAdminEmails(rawEmails);
  if (emails.length === 0) return result;

  const audit = new AuditService(pool);

  for (const email of emails) {
    // `email` is citext, so this match is already case-insensitive
    const found = await pool.query<UserRow>(
      `SELECT id, roles, email_verified_at, deleted_at, banned_at FROM users WHERE email = $1`,
      [email],
    );
    const user = found.rows[0];

    if (!user) {
      result.missing.push(email);
      log.info({ email }, 'bootstrap admin: no account with this address yet — will retry on next start');
      continue;
    }
    if (user.deleted_at || user.banned_at) {
      result.skipped.push(email);
      log.warn({ email, userId: user.id }, 'bootstrap admin: account is deleted or banned — not granting');
      continue;
    }
    // The security boundary: the address alone proves nothing, confirming it does.
    if (!user.email_verified_at) {
      result.unverified.push(email);
      log.warn(
        { email, userId: user.id },
        'bootstrap admin: email not confirmed — NOT granting (verify the address, then restart)',
      );
      continue;
    }
    const missingRoles = BOOTSTRAP_ADMIN_ROLES.filter((r) => !user.roles.includes(r));
    if (missingRoles.length === 0) {
      result.skipped.push(email);
      continue;
    }

    // role change + audit row in one transaction: no elevation without a record
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ roles: string[] }>(
        `UPDATE users
            SET roles = (SELECT array_agg(DISTINCT r) FROM unnest(roles || $2::text[]) AS r)
          WHERE id = $1 AND deleted_at IS NULL AND banned_at IS NULL AND email_verified_at IS NOT NULL
        RETURNING roles`,
        [user.id, [...BOOTSTRAP_ADMIN_ROLES]],
      );
      if (updated.rowCount === 0) {
        // raced with a delete/ban/unverify between the read and the write
        await client.query('ROLLBACK');
        result.skipped.push(email);
        log.warn({ email, userId: user.id }, 'bootstrap admin: account changed during grant — skipped');
        continue;
      }
      await audit.record(client, {
        adminId: SYSTEM_ACTOR_ID,
        action: 'admin.bootstrap_grant',
        targetType: 'user',
        targetId: user.id,
        before: { roles: user.roles },
        after: { roles: updated.rows[0]!.roles },
        reason: 'BOOTSTRAP_ADMIN_EMAILS allowlist (verified address)',
      });
      await client.query('COMMIT');
      result.granted.push(email);
      log.info({ email, userId: user.id, roles: updated.rows[0]!.roles }, 'bootstrap admin: granted');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      log.warn({ err, email }, 'bootstrap admin: grant failed');
    } finally {
      client.release();
    }
  }

  return result;
}
