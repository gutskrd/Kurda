/**
 * Consent policy constants (KUR-109). Bump CURRENT_POLICY_VERSION when
 * the ToS/privacy policy materially changes — clients see
 * needsReconsent: true and must re-accept via POST /me/consent.
 *
 * The age below which consent needs a parent (16) used to live here and was
 * applied once, at sign-up, into a flag that never changed again. It is now
 * `DIGITAL_CONSENT_AGE` in @kurda/shared, beside the other age lines, and is
 * worked out from the birth month whenever it is asked (users/age.ts).
 */
export const CURRENT_POLICY_VERSION = '2026-07-01';
