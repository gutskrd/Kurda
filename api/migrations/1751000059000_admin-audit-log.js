/**
 * Admin audit log (KUR-104). An append-only record of every admin mutation:
 * who, what, target, optional before/after snapshots, and reason. Unlike other
 * ledgers there is NO escape hatch — UPDATE and DELETE are always rejected, with
 * no `ledger_admin` bypass — so the trail can never be edited or erased, not
 * even by a superadmin. `admin_id`/`target_id` are plain columns (no FK) so the
 * audit outlives the users it references (a deleted admin's actions still show).
 */

export const up = (pgm) => {
  pgm.createTable('admin_audit_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    admin_id: { type: 'uuid', notNull: true }, // no FK: audit survives user deletion
    action: { type: 'text', notNull: true },
    target_type: { type: 'text' },
    target_id: { type: 'text' },
    before: { type: 'jsonb' },
    after: { type: 'jsonb' },
    reason: { type: 'text' },
    request_id: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('admin_audit_log', 'created_at');
  pgm.createIndex('admin_audit_log', 'admin_id');
  pgm.createIndex('admin_audit_log', 'target_id');

  // hard append-only: no UPDATE, no DELETE, no bypass
  pgm.createFunction(
    'admin_audit_log_immutable',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       RAISE EXCEPTION 'admin_audit_log is append-only and cannot be modified or deleted';
     END;`,
  );
  pgm.createTrigger('admin_audit_log', 'admin_audit_log_no_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'admin_audit_log_immutable',
  });
};

export const down = (pgm) => {
  pgm.dropTrigger('admin_audit_log', 'admin_audit_log_no_rewrite');
  pgm.dropFunction('admin_audit_log_immutable', []);
  pgm.dropTable('admin_audit_log');
};
