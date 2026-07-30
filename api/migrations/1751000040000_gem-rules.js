/**
 * Gem earning rules (KUR-068). All earn amounts/caps/cooldowns live in this one
 * config table — no hardcoded grant amounts in code. Each grant is written to
 * the append-only wallet_ledger with reason `gem_earn:{key}`, so the per-rule
 * and per-user daily caps are computed by summing today's ledger, and an
 * idempotency key (`gem:{key}:{refId}`) prevents a backfill from double-granting.
 */

export const up = (pgm) => {
  pgm.createTable('gem_rules', {
    key: { type: 'text', primaryKey: true },
    amount: { type: 'integer', notNull: true },
    /** max Gems from THIS rule per user per day; null = unlimited */
    daily_cap: { type: 'integer' },
    /** min seconds between grants of this rule to one user; 0 = none */
    cooldown_seconds: { type: 'integer', notNull: true, default: 0 },
    active: { type: 'boolean', notNull: true, default: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('gem_rules', 'gem_rules_amount_check', { check: 'amount > 0' });

  // seed the earning rules (tunable by admins later, never hardcoded)
  pgm.sql(`
    INSERT INTO gem_rules (key, amount, daily_cap, cooldown_seconds) VALUES
      ('perfect_lesson', 5, 50, 0),
      ('league_promotion', 25, NULL, 0),
      ('tournament_win', 50, NULL, 0),
      ('achievement_milestone', 15, 100, 0);
  `);
};

export const down = (pgm) => {
  pgm.dropTable('gem_rules');
};
