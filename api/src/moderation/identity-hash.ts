import { createHash, createHmac } from 'node:crypto';
import { moderationKeyed, normalizeEmailForRegistry } from './pseudonym.js';

/**
 * Keyed hashes of what identifies a person (an address, a sign-in provider's subject, a phone number, an install id, a
 * push token), as the ban registry and the phone checks keep them; never the value itself.
 *
 * Version 1 is keyed from the JWT secret, as the registry always was. With IDENTITY_HASH_SECRET set, new hashes are
 * version 2 and every lookup tries both versions, so setting the secret loses nothing, and a later JWT secret rotation
 * no longer empties the registry once the re-key sweep has rewritten what it can (ban-registry.ts `rekeyRegistry`).
 */

export const IDENTITY_KINDS = ['email', 'oauth', 'phone', 'device', 'push'] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/** Keyed from the JWT secret (the moderation key). */
export const LEGACY_KEY_VERSION = 1;
/** Keyed from IDENTITY_HASH_SECRET. */
export const DEDICATED_KEY_VERSION = 2;

let dedicatedKey: string | null = null;

/** Called at start-up with IDENTITY_HASH_SECRET, or nothing to keep using the JWT-derived key alone. */
export function setIdentityKey(secret: string | null | undefined): void {
  dedicatedKey = secret && secret.length > 0 ? secret : null;
}

/** The version new hashes are written with. */
export function currentKeyVersion(): number {
  return dedicatedKey ? DEDICATED_KEY_VERSION : LEGACY_KEY_VERSION;
}

/** Every version a lookup tries, current first. */
export function keyVersions(): number[] {
  return dedicatedKey ? [DEDICATED_KEY_VERSION, LEGACY_KEY_VERSION] : [LEGACY_KEY_VERSION];
}

/**
 * The value as it is compared: an address normalised (pseudonym.ts), a provider subject as `provider:subject`, the rest
 * trimmed. A phone arrives already hashed (`phoneHashes`), an install id as the sha256 risk scoring stores.
 */
export function canonicalIdentity(kind: IdentityKind, value: string): string {
  return kind === 'email' ? normalizeEmailForRegistry(value) : value.trim();
}

/** The registry's hash of a value in one key version. An address in version 1 is exactly the old registry's hash. */
export function identityHash(kind: IdentityKind, value: string, version: number = currentKeyVersion()): string {
  const canonical = canonicalIdentity(kind, value);
  if (version === DEDICATED_KEY_VERSION) {
    if (!dedicatedKey) throw new Error('IDENTITY_HASH_SECRET is not set');
    return createHmac('sha256', dedicatedKey).update(`hevalo-identity-v2:${kind}:${canonical}`).digest('hex');
  }
  return moderationKeyed(kind === 'email' ? 'email' : `identity-${kind}`, canonical);
}

/** The value's hash in every version a lookup tries. */
export function identityHashes(kind: IdentityKind, value: string): Array<{ version: number; hash: string }> {
  return keyVersions().map((version) => ({ version, hash: identityHash(kind, value, version) }));
}

/**
 * A phone number (E.164) as accounts store it: keyed in the current version. Before keys it was a plain SHA-256, which
 * anyone can reverse by trying every number; those rows are matched too and rewritten when the number is entered again,
 * since the number itself is never kept.
 */
export function phoneHash(e164: string): string {
  return identityHash('phone', `tel:${e164}`);
}

/** Every stored form one number can have: keyed in each version, and the old plain hash. */
export function phoneHashCandidates(e164: string): string[] {
  const keyed = keyVersions().map((v) => identityHash('phone', `tel:${e164}`, v));
  return [...keyed, legacyPhoneHash(e164)];
}

/** The plain SHA-256 phone numbers were stored as before they were keyed. */
export function legacyPhoneHash(e164: string): string {
  return createHash('sha256').update(e164).digest('hex');
}

/** An install id as risk scoring and device sightings store it: SHA-256 of the opaque random id the app makes. */
export function deviceHashOf(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex');
}
