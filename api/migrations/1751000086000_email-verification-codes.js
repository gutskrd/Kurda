/**
 * Email ownership verification by code (KUR-014). A short-lived 6-digit code is
 * emailed on sign-up; the user proves ownership by entering it. One active code
 * per user (PK on user_id → upsert on resend). `attempts` caps brute force of the
 * low-entropy code; the raw code is never stored — only a SHA-256 hash bound to
 * the user id.
 *
 * SAFETY: structural, additive. New table only; no data migration.
 */

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE email_verification_codes (
      user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash  text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts   integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS email_verification_codes`);
};
