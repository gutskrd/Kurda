/**
 * Consent policy constants (KUR-109). Bump CURRENT_POLICY_VERSION when
 * the ToS/privacy policy materially changes — clients see
 * needsReconsent: true and must re-accept via POST /me/consent.
 */
export const CURRENT_POLICY_VERSION = '2026-07-01';

/** Countries may override (e.g. 13 in some jurisdictions); default GDPR-safe. */
export const DEFAULT_RESTRICTED_AGE_THRESHOLD = 16;

export function ageOn(birthDate: Date, on: Date): number {
  let age = on.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    on.getMonth() < birthDate.getMonth() ||
    (on.getMonth() === birthDate.getMonth() && on.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isRestrictedAge(
  birthDate: Date,
  threshold = DEFAULT_RESTRICTED_AGE_THRESHOLD,
  now = new Date(),
): boolean {
  return ageOn(birthDate, now) < threshold;
}
