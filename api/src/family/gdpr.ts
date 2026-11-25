/**
 * Families and child profiles in a data export, and what erasing takes with it. A child's profile is deleted whole,
 * learning included, with no anonymous row left; what stays is the consent log, which names the parent and never
 * the child, for CONSENT_LOG_YEARS.
 */
import type { Executor } from '../moderation/tx.js';

/** How long the record that a parent consented to, or deleted, a child's profile is kept. */
export const CONSENT_LOG_YEARS = 3;

/**
 * Everything about families in a person's export (Art. 15): the family they are in and who else is, by name; the
 * child profiles they made with each consent; what their children asked them to buy; and, for a child's own export
 * (which their parent downloads), the profile's consent record and their own asks.
 */
export async function exportFamily(db: Executor, userId: string): Promise<Record<string, unknown>> {
  const member = await db.query<{ role: string; joined_at: Date; family_id: string; plus_until: Date | null; created_at: Date }>(
    `SELECT fm.role, fm.joined_at, f.id AS family_id, f.plus_until, f.created_at
       FROM family_members fm JOIN families f ON f.id = fm.family_id WHERE fm.user_id = $1`,
    [userId],
  );
  const family = member.rows[0];
  const people = family
    ? await db.query<{ name: string; role: string; joined_at: Date }>(
        `SELECT COALESCE(NULLIF(trim(u.display_name), ''), u.username) AS name, fm.role, fm.joined_at
           FROM family_members fm JOIN users u ON u.id = fm.user_id
          WHERE fm.family_id = $1 AND fm.user_id <> $2 ORDER BY fm.joined_at`,
        [family.family_id, userId],
      )
    : { rows: [] };
  const children = await db.query(
    `SELECT u.display_name AS name, u.birth_year, u.birth_month, cp.consent_version, cp.consented_at, cp.reminders_allowed,
            cp.purchases_allowed, cp.created_at
       FROM child_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.parent_id = $1 ORDER BY cp.created_at`,
    [userId],
  );
  const ownProfile = await db.query(
    `SELECT cp.consent_version, cp.consented_at, cp.reminders_allowed, cp.purchases_allowed, cp.created_at,
            COALESCE(NULLIF(trim(p.display_name), ''), p.username) AS parent
       FROM child_profiles cp JOIN users p ON p.id = cp.parent_id WHERE cp.user_id = $1`,
    [userId],
  );
  const asks = await db.query(
    `SELECT kind, product, status, created_at, decided_at FROM child_purchase_requests
      WHERE child_id = $1 OR parent_id = $1 ORDER BY created_at`,
    [userId],
  );
  return {
    family: family
      ? { role: family.role, joinedAt: family.joined_at, createdAt: family.created_at, planUntil: family.plus_until, others: people.rows }
      : null,
    childProfilesMade: children.rows,
    childProfile: ownProfile.rows[0] ?? null,
    purchaseRequests: asks.rows,
  };
}

/**
 * Deletes one child's profile for good, in the caller's transaction (it must be in one), after `eraseAccountData` has
 * taken everything the account holds (gdpr/service.ts `eraseChildProfile`): the rows that keep an id without a
 * reference to the account, then the account itself, whose references take the rest with it. The consent log keeps
 * only that the parent deleted it. The security log alone keeps its events for their retention, as it does for
 * everyone; a child's hold no address, network or device, only an id that no longer names anybody. False when the
 * profile was already gone.
 */
export async function deleteChildRows(db: Executor, childId: string): Promise<boolean> {
  const profile = await db.query<{ parent_id: string; consent_version: string }>(
    `SELECT parent_id, consent_version FROM child_profiles WHERE user_id = $1`,
    [childId],
  );
  const row = profile.rows[0];
  if (!row) return false;
  await db.query(`DELETE FROM risk_decisions WHERE user_id = $1`, [childId]);
  await db.query(`DELETE FROM story_game_answers WHERE user_id = $1`, [childId]);
  await db.query(`INSERT INTO child_consent_log (parent_id, action, consent_version) VALUES ($1, 'deleted', $2)`, [row.parent_id, row.consent_version]);
  // The ledgers take deletes only under this flag, which a hard delete of an account is for; it is lowered at once.
  await db.query(`SET LOCAL kurda.ledger_admin = 'on'`);
  await db.query(`DELETE FROM users WHERE id = $1 AND kind = 'child'`, [childId]);
  await db.query(`SET LOCAL kurda.ledger_admin = 'off'`);
  return true;
}

/**
 * A person's account closing takes them out of their family, ends the family they own, and forgets their PIN; their
 * child profiles are deleted by the caller first. Other members' own children stay with their parents.
 */
export async function leaveFamilyOnErase(db: Executor, userId: string): Promise<void> {
  await db.query(`DELETE FROM families WHERE owner_id = $1`, [userId]);
  await db.query(`DELETE FROM family_members WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM family_pins WHERE parent_id = $1`, [userId]);
}

/** The child profiles a parent made, for erasing with the parent's account. */
export async function childrenOf(db: Executor, parentId: string): Promise<string[]> {
  const r = await db.query<{ user_id: string }>(`SELECT user_id FROM child_profiles WHERE parent_id = $1 ORDER BY created_at`, [parentId]);
  return r.rows.map((row) => row.user_id);
}
