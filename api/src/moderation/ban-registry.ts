import { emailRegistryHash } from './pseudonym.js';
import type { Executor } from './tx.js';

/**
 * Whether an address belongs to a permanently banned account, by keyed hash (pseudonym.ts normalises away `+tags` and
 * dot tricks). Sign-up answers a match with the same generic refusal as every anti-abuse check, so the registry cannot
 * be used to probe addresses.
 */
export async function isBannedEmail(db: Executor, email: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM ban_registry WHERE kind = 'email' AND value_hash = $1`, [emailRegistryHash(email)]);
  return (r.rowCount ?? 0) > 0;
}
