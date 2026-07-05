import type pg from 'pg';

/**
 * Base class for repositories over soft-deleted tables.
 *
 * Convention (api/DATABASE.md): rows are never hard-deleted by
 * application code; queries must exclude deleted rows via activeWhere().
 * Hard deletion happens only in the GDPR anonymization job (KUR-024).
 */
export abstract class SoftDeleteRepository {
  constructor(
    protected readonly pool: pg.Pool,
    protected readonly table: string,
  ) {}

  /** SQL fragment every read query must include. */
  protected activeWhere(alias = ''): string {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}deleted_at IS NULL`;
  }

  /** Marks a row deleted; returns true if a live row was affected. */
  async softDelete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.table} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
