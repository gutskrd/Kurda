import type pg from 'pg';
import type { SecurityRecorder } from '../security/log.js';
import { AuditService } from './audit-service.js';
import { maskEmail } from '../observability/redact.js';

/**
 * Bootstrap admin grants (BOOTSTRAP_ADMIN_EMAILS). The first admin cannot be created in the panel, so the API
 * reconciles a configured allowlist on every boot:
 * - **Bound to proven mailbox control, not the address.** Only an account that CONFIRMED its email is granted, so
 *   registering someone else's address is not enough. An unverified match is refused, logged and re-evaluated next
 *   boot.
 * - **Addresses live in configuration, never in the repository.** The repo is public; committing them would publish
 *   which accounts to attack.
 * - **Never revokes.** Removing an address stops future grants but keeps roles, so a config slip cannot lock everyone
 *   out. Revoke from the panel or database.
 * - **Skips deleted and banned accounts**, so a disabled account is never re-elevated.
 * - **Audited** in the same transaction as the role change: if the audit write fails, the grant rolls back.
 *
 * Sensitive admin routes still require enrolled TOTP 2FA (see `requireAdmin`).
 */

/**
 * Both on purpose: `superadmin` is the RBAC role the admin app's capability checks use, while many routes (moderation,
 * economy, events, experiments, fraud, analytics, tournaments, …) still accept only the legacy `admin`.
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
 * Reconcile the configured admin allowlist. Idempotent and safe on every boot; an address not ready yet (no account, or
 * unverified) is picked up on a later start.
 */
export async function grantBootstrapAdmins(
  pool: pg.Pool,
  rawEmails: string,
  log: BootstrapLogger,
  /** where each grant is also recorded as a change of staff access (security/log.ts) */
  security?: SecurityRecorder,
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
      log.info({ address: maskEmail(email) }, 'bootstrap admin: no account with this address yet — will retry on next start');
      continue;
    }
    if (user.deleted_at || user.banned_at) {
      result.skipped.push(email);
      log.warn({ address: maskEmail(email), userId: user.id }, 'bootstrap admin: account is deleted or banned — not granting');
      continue;
    }
    // The security boundary: the address alone proves nothing, confirming it does.
    if (!user.email_verified_at) {
      result.unverified.push(email);
      log.warn(
        { address: maskEmail(email), userId: user.id },
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
        log.warn({ address: maskEmail(email), userId: user.id }, 'bootstrap admin: account changed during grant — skipped');
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
      await security?.record('access.role_granted', {
        userId: user.id,
        staff: true,
        details: { roles: updated.rows[0]!.roles.filter((r) => !user.roles.includes(r)), by: 'the server’s admin list' },
      });
      result.granted.push(email);
      log.info({ address: maskEmail(email), userId: user.id, roles: updated.rows[0]!.roles }, 'bootstrap admin: granted');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      log.warn({ err, address: maskEmail(email) }, 'bootstrap admin: grant failed');
    } finally {
      client.release();
    }
  }

  return result;
}
