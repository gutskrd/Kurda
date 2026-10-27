/**
 * Taking Hevalo offline for a while from the admin console (maintenance/
 * service.ts; @kurda/shared maintenance.ts): one row, whether it is on, from
 * and until when, and what people see meanwhile. The picture is an upload
 * from the shop's art pipeline (`cosmetic/background/<sha256>`), held while
 * this row names it. Who changed it and when is in the admin audit trail and
 * the security log.
 */

export const up = (pgm) => {
  pgm.createTable('maintenance', {
    // one row, always
    id: { type: 'smallint', primaryKey: true, default: 1, check: 'id = 1' },
    enabled: { type: 'boolean', notNull: true, default: false },
    title: { type: 'text' },
    message: { type: 'text' },
    asset_key: { type: 'text' },
    starts_at: { type: 'timestamptz' },
    ends_at: { type: 'timestamptz' },
    reopen_at_end: { type: 'boolean', notNull: true, default: true },
    updated_by: { type: 'uuid' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('maintenance', 'maintenance_window', { check: 'ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at' });
  pgm.sql(`INSERT INTO maintenance (id) VALUES (1)`);
};

export const down = (pgm) => {
  pgm.dropTable('maintenance');
};
