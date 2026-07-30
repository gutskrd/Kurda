/**
 * GDPR consent + minor protection (KUR-109):
 * - consent_version/consented_at: which ToS+privacy version the user
 *   accepted, and when (re-consent required on version bumps)
 * - analytics_consent: OFF by default; the analytics pipeline (KUR-105)
 *   must gate on it for EU users
 * - birth_date + restricted_mode: under-threshold accounts get social
 *   features restricted (chat off, profile private — enforced by the
 *   social issues reading this flag)
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    consent_version: { type: 'text' },
    consented_at: { type: 'timestamptz' },
    analytics_consent: { type: 'boolean', notNull: true, default: false },
    birth_date: { type: 'date' },
    restricted_mode: { type: 'boolean', notNull: true, default: false },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', [
    'consent_version',
    'consented_at',
    'analytics_consent',
    'birth_date',
    'restricted_mode',
  ]);
};
