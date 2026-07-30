/**
 * Email suppression list (KUR-098). A hard bounce or spam complaint from the
 * provider's webhook lands here; the email service skips any address present so
 * we never keep mailing a dead or complaining recipient (protects sender
 * reputation). Keyed by lowercased email.
 */

export const up = (pgm) => {
  pgm.createTable('email_suppressions', {
    email: { type: 'text', primaryKey: true },
    reason: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('email_suppressions', 'email_suppressions_reason_check', {
    check: "reason IN ('bounce', 'complaint', 'manual')",
  });
};

export const down = (pgm) => {
  pgm.dropTable('email_suppressions');
};
