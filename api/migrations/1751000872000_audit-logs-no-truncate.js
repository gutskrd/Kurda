/**
 * The admin audit trail and the security log refuse every UPDATE and DELETE row by row (migrations 1751000059000 and
 * 1751000200000), but TRUNCATE skips row triggers, so either could still be emptied at once. Now each refuses that too,
 * as the wallet ledger does.
 */

const TABLES = ['admin_audit_log', 'security_events'];

export const up = (pgm) => {
  pgm.createFunction(
    'append_only_no_truncate',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       RAISE EXCEPTION '% is append-only and cannot be emptied', TG_TABLE_NAME;
     END;`,
  );
  for (const table of TABLES) {
    pgm.createTrigger(table, `${table}_no_truncate`, {
      when: 'BEFORE',
      operation: 'TRUNCATE',
      level: 'STATEMENT',
      function: 'append_only_no_truncate',
    });
  }
};

export const down = (pgm) => {
  for (const table of TABLES) pgm.dropTrigger(table, `${table}_no_truncate`);
  pgm.dropFunction('append_only_no_truncate', []);
};
