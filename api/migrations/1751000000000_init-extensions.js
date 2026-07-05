/**
 * Foundational Postgres extensions:
 *  - pgcrypto: gen_random_uuid() for UUID primary keys
 *  - citext:   case-insensitive text for email/username uniqueness (KUR-004)
 */

export const up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createExtension('citext', { ifNotExists: true });
};

export const down = (pgm) => {
  pgm.dropExtension('citext', { ifExists: true });
  pgm.dropExtension('pgcrypto', { ifExists: true });
};
