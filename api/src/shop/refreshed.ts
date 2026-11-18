import type pg from 'pg';

/**
 * Replaced shop items from their owners' side: the one-time notice that their art was redrawn. The old items were
 * given new art and withdrawn (migration 1751000161000), and each owner has a `cosmetic_refreshes` row. Owners keep
 * the item, as purchases are final; the paid-price columns remain as history and are not read. The apps' shape is in
 * shared/src/cosmetics.ts.
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
