import { createHmac } from 'node:crypto';
import { DEV_JWT_SECRET } from '../config/env.js';

/**
 * Keyed pseudonyms for moderation records.
 *
 * A report, a sanction or an audit row outlives the account it is about: the
 * id is nulled if a row is ever hard-deleted, and these hashes stay, so a
 * reporter's accuracy and a person's history can still be counted without
 * keeping who they were. The banned-address registry uses the same key, so a
 * permanently banned person's email can be recognised at signup without the
 * address itself being stored.
 *
 * Keyed with a server secret (set from the app's JWT secret at start-up, like
 * the lesson shuffle) rather than plain hashes: a plain hash of a uuid or an
 * email is one dictionary away from the original. Rotating that secret makes
 * old registry entries unrecognisable — a deliberate, documented trade: the
 * registry is a brake on re-registration, not a permanent list.
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
 * A network address as the public copyright form's per-address limit counts
 * it: the notice keeps this, never the address.
 */
export function networkHash(ip: string): string {
  return keyed('ip', ip);
}

/**
 * An email as the ban registry compares it: lower-cased and trimmed, without a
 * `+tag`, and for Gmail without the dots Gmail ignores — the cheap tricks for
 * making "a new address" that delivers to the same inbox.
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
 * Where a quarantined file is kept: `quarantine/<keyed hash>/<its key>`. Keyed,
 * so nobody can work out the private copy's address from the public one; and
 * the same for the same file every time, so two runs that race to move it
 * write the same object and neither leaves a stray copy behind.
 */
export function evidenceObjectKey(key: string): string {
  return `quarantine/${keyed('evidence-object', key).slice(0, 40)}/${key}`;
}
