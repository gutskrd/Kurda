import { createHmac } from 'node:crypto';
import { DEV_JWT_SECRET } from '../config/env.js';

/**
 * Keyed pseudonyms for moderation records. Reports, sanctions and audit rows outlive their accounts: ids are nulled on
 * hard delete while these hashes stay, so reporter accuracy and a person's history can still be counted without keeping
 * who they were. The banned-address registry uses the same key, so a permanently banned email is recognised at sign-up
 * without being stored.
 *
 * Keyed with a server secret (set from the JWT secret at start-up, like the lesson shuffle) because a plain hash of a
 * uuid or email is one dictionary away from the original. Rotating the secret makes old registry entries
 * unrecognisable, a deliberate trade: the registry slows re-registration, it is not a permanent list.
 */
let moderationKey: string = DEV_JWT_SECRET;

export function setModerationKey(key: string): void {
  moderationKey = key;
}

function keyed(purpose: string, value: string): string {
  return createHmac('sha256', moderationKey).update(`hevalo-moderation-v1:${purpose}:${value}`).digest('hex');
}

/** The pseudonym of an account in moderation records. */
export function userHash(userId: string): string {
  return keyed('user', userId);
}

/**
 * A network address as the public copyright form's per-address limit counts it; the notice keeps this hash, never the
 * address.
 */
export function networkHash(ip: string): string {
  return keyed('ip', ip);
}

/**
 * A network as account linking, sign-up caps and network sightings store it: the keyed hash of `networkKey`
 * (net/network-key.ts), never the address. Plain hashes of IPv4 addresses protect nothing, since there are only 2^32 to
 * try.
 */
export function networkKeyHash(key: string): string {
  return keyed('network-v2', key);
}

/**
 * An email as the ban registry compares it: lower-cased and trimmed, without a `+tag`, and without the dots some
 * providers ignore, which are the cheap ways to make a "new address" that reaches the same inbox.
 */
export function normalizeEmailForRegistry(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** The registry's hash of an email address. */
export function emailRegistryHash(email: string): string {
  return keyed('email', normalizeEmailForRegistry(email));
}

/**
 * Where a quarantined file is kept: `quarantine/<keyed hash>/<its key>`. Keyed, so the private copy's address cannot be
 * derived from the public one, and stable, so racing moves write the same object and leave no stray copy.
 */
export function evidenceObjectKey(key: string): string {
  return `quarantine/${keyed('evidence-object', key).slice(0, 40)}/${key}`;
}
