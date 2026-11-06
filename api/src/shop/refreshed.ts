import type pg from 'pg';

/**
 * Replaced shop items, from their owners' side: the one-time notice that their
 * art was redrawn, and nothing more.
 *
 * The shop's old backgrounds and icons were given new art and taken out of the
 * shop (migration 1751000161000). Every owner of one has a row in
 * `cosmetic_refreshes`, written when the art changed. The owner keeps the item
 * with its new art: a purchase is final, so no item is ever handed back for
 * currency. The rows once also recorded what each owner paid, for a return
 * that no longer exists; those columns stay as history and nothing here reads
 * them. The shape the apps read is in shared/src/cosmetics.ts.
 */
export class RefreshedNotices {
  constructor(private readonly pool: pg.Pool) {}

  /** Replaced items the user still has and has not been told about yet. */
  async unnoticed(userId: string): Promise<string[]> {
    const rows = await this.pool.query<{ sku: string }>(
      `SELECT rf.sku
         FROM cosmetic_refreshes rf
         JOIN cosmetic_replacements rp ON rp.sku = rf.sku
         JOIN user_entitlements e ON e.user_id = rf.user_id AND e.sku = rf.sku
        WHERE rf.user_id = $1 AND rf.noticed_at IS NULL AND rf.returned_at IS NULL
        ORDER BY rf.sku`,
      [userId],
    );
    return rows.rows.map((r) => r.sku);
  }

  /** The notice has been shown: it is not shown again. Returns how many changed. */
  async markNoticed(userId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE cosmetic_refreshes SET noticed_at = now() WHERE user_id = $1 AND noticed_at IS NULL`,
      [userId],
    );
    return res.rowCount ?? 0;
  }
}
