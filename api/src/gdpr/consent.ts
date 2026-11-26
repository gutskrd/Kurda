/**
 * Consent policy constants. Bump CURRENT_POLICY_VERSION when the terms or privacy policy materially change: clients
 * then see needsReconsent: true and must accept again via POST /me/consent. The parental-consent age is
 * `DIGITAL_CONSENT_AGE` in @kurda/shared, applied from the birth month on every ask (users/age.ts).
 */
export const CURRENT_POLICY_VERSION = '2026-11-26';
