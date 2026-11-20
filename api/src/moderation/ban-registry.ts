import { identityHash, identityHashes, keyVersions, phoneHashCandidates, currentKeyVersion, type IdentityKind } from './identity-hash.js';
import { userHash } from './pseudonym.js';
import type { Executor } from './tx.js';

/**
 * The ban registry: what identifies a banned or suspended person, kept as keyed hashes (identity-hash.ts) for as long
 * as the ban stands, so the same person is recognised when they come back.
 *
 * - Written when a suspension or ban is recorded (a ban waiting for a second admin too), one row per signal per ban:
 *   the normalised address, sign-in provider subjects, the phone, every install id seen for them in the last
 *   {@link DEVICE_LOOKBACK_DAYS} days (at most {@link MAX_DEVICE_SIGNALS}), and push tokens.
 * - Networks are never written: a shared network is evidence for a person to weigh, never a reason on its own.
 * - A row counts while its ban is in force (a suspension's ends with it); lifting a ban deletes its rows, and since
 *   each ban has its own rows, another banned person on the same family tablet keeps theirs.
 *
 * Sign-up answers an identity match with the same generic refusal as every anti-abuse check, so the registry cannot
 * be used to probe addresses.
 */

/** How far back a banned person's install ids are taken. */
export const DEVICE_LOOKBACK_DAYS = 180;
/** The most install ids one ban registers, newest first. */
export const MAX_DEVICE_SIGNALS = 50;
/** The most sign-in provider subjects and push tokens one ban registers. */
export const MAX_OAUTH_SIGNALS = 10;
export const MAX_PUSH_SIGNALS = 20;

/** SQL: registry row `r` belongs to a ban in force (or waiting for its second admin). */
export const REGISTRY_IN_FORCE_SQL = `(r.expires_at IS NULL OR r.expires_at > now())
  AND EXISTS (SELECT 1 FROM sanctions s WHERE s.id = r.sanction_id AND s.revoked_at IS NULL AND (s.ends_at IS NULL OR s.ends_at > now()))`;

/** One identifying value of a person, as the registry writes it. */
export interface PersonSignal {
  kind: IdentityKind;
  /** the value the registry hashes: an address, `provider:subject`, a stored phone hash, a device hash, a push token */
  value: string;
  /** when it was last seen for them */
  seenAt: Date | null;
}

/** Everything the registry would write for this person, capped per kind. */
export async function collectSignals(db: Executor, userId: string): Promise<PersonSignal[]> {
  const r = await db.query<{ kind: IdentityKind; value: string; seen_at: Date | null }>(
    `SELECT 'email' AS kind, u.email::text AS value, u.last_seen_at AS seen_at FROM users u
      WHERE u.id = $1 AND u.email IS NOT NULL AND NOT u.guest
        AND u.email NOT LIKE '%@noemail.kurda.app' AND u.email NOT LIKE '%@deleted.kurda.app'
     UNION ALL
     SELECT 'phone', u.phone_hash, u.phone_verified_at FROM users u WHERE u.id = $1 AND u.phone_hash IS NOT NULL
     UNION ALL
     (SELECT 'oauth', o.provider || ':' || o.provider_user_id, o.created_at FROM oauth_identities o
       WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT $3)
     UNION ALL
     (SELECT 'device', d.device_hash, max(d.at) FROM (
         SELECT device_hash, last_at AS at FROM device_sightings
          WHERE user_id = $1 AND day >= (now() AT TIME ZONE 'UTC')::date - $2::int
         UNION ALL
         SELECT device_hash, created_at FROM risk_decisions
          WHERE user_id = $1 AND device_hash IS NOT NULL AND created_at > now() - make_interval(days => $2::int)
       ) d GROUP BY d.device_hash ORDER BY max(d.at) DESC LIMIT $4)
     UNION ALL
     (SELECT 'push', t.token, t.last_seen_at FROM device_tokens t WHERE t.user_id = $1 ORDER BY t.last_seen_at DESC LIMIT $5)`,
    [userId, DEVICE_LOOKBACK_DAYS, MAX_OAUTH_SIGNALS, MAX_DEVICE_SIGNALS, MAX_PUSH_SIGNALS],
  );
  return r.rows.map((row) => ({ kind: row.kind, value: row.value, seenAt: row.seen_at }));
}

/**
 * Register a ban's signals, in the caller's transaction and before its sessions end (which drops the push tokens).
 * `signals` defaults to collecting them now. Returns how many rows were written.
 */
export async function registerBan(
  db: Executor,
  ban: { sanctionId: string; userId: string; endsAt: Date | null },
  signals?: PersonSignal[],
): Promise<number> {
  const found = signals ?? (await collectSignals(db, ban.userId));
  if (found.length === 0) return 0;
  const version = currentKeyVersion();
  const r = await db.query(
    `INSERT INTO ban_registry (kind, value_hash, key_version, sanction_id, user_id, user_hash, expires_at, seen_at)
     SELECT s.kind, s.value_hash, $3, $1, $2, $4, $5, s.seen_at
       FROM unnest($6::text[], $7::text[], $8::timestamptz[]) AS s(kind, value_hash, seen_at)
     ON CONFLICT (kind, key_version, value_hash, sanction_id) DO UPDATE SET seen_at = GREATEST(ban_registry.seen_at, EXCLUDED.seen_at)`,
    [
      ban.sanctionId,
      ban.userId,
      version,
      userHash(ban.userId),
      ban.endsAt,
      found.map((s) => s.kind),
      found.map((s) => identityHash(s.kind, s.value, version)),
      found.map((s) => s.seenAt),
    ],
  );
  return r.rowCount ?? 0;
}

/** A ban lifted, overturned or lapsed: its rows go. */
export async function unregisterBans(db: Executor, sanctionIds: readonly string[]): Promise<number> {
  if (sanctionIds.length === 0) return 0;
  const r = await db.query(`DELETE FROM ban_registry WHERE sanction_id = ANY($1::uuid[])`, [sanctionIds]);
  return r.rowCount ?? 0;
}

/** Rows of suspensions that have ended, and of bans no longer in force; the lookups ignore them anyway. */
export async function pruneRegistry(db: Executor, limit = 5000): Promise<number> {
  const r = await db.query(
    `DELETE FROM ban_registry WHERE id IN (
       SELECT r.id FROM ban_registry r
        WHERE (r.expires_at IS NOT NULL AND r.expires_at <= now())
           OR NOT EXISTS (SELECT 1 FROM sanctions s WHERE s.id = r.sanction_id AND s.revoked_at IS NULL AND (s.ends_at IS NULL OR s.ends_at > now()))
        LIMIT $1)`,
    [limit],
  );
  return r.rowCount ?? 0;
}

/** A value to look up: a raw address, subject or push token, a device hash, or a phone number (E.164). */
export interface Probe {
  kind: IdentityKind;
  value: string;
}

/** Every registry hash a probe can be stored under, in every key version (and, for a phone, every stored form). */
export function probeHashes(probe: Probe): Array<{ version: number; hash: string }> {
  if (probe.kind !== 'phone') return identityHashes(probe.kind, probe.value);
  return phoneHashCandidates(probe.value).flatMap((stored) => keyVersions().map((version) => ({ version, hash: identityHash('phone', stored, version) })));
}

/** One registry row a probe matched. */
export interface RegistryMatch {
  kind: IdentityKind;
  bannedUserId: string | null;
  bannedUserHash: string | null;
  sanctionId: string;
  seenAt: Date | null;
}

/** The most matches one lookup returns. */
export const MAX_REGISTRY_MATCHES = 50;

/**
 * Registry rows of bans in force that any probe matches, other than the asking account's own. One indexed statement
 * whatever the number of probes.
 */
export async function matchRegistry(db: Executor, probes: readonly Probe[], selfId: string | null = null): Promise<RegistryMatch[]> {
  const keys = probes.flatMap((p) => probeHashes(p).map((h) => ({ kind: p.kind, ...h })));
  if (keys.length === 0) return [];
  const r = await db.query<{ kind: IdentityKind; user_id: string | null; user_hash: string | null; sanction_id: string; seen_at: Date | null }>(
    `SELECT r.kind, r.user_id, r.user_hash, r.sanction_id, r.seen_at
       FROM unnest($1::text[], $2::smallint[], $3::text[]) AS k(kind, key_version, value_hash)
       JOIN ban_registry r ON r.kind = k.kind AND r.key_version = k.key_version AND r.value_hash = k.value_hash
      WHERE ${REGISTRY_IN_FORCE_SQL}
        AND ($4::uuid IS NULL OR r.user_id IS DISTINCT FROM $4::uuid)
      LIMIT $5`,
    [keys.map((k) => k.kind), keys.map((k) => k.version), keys.map((k) => k.hash), selfId, MAX_REGISTRY_MATCHES],
  );
  return r.rows.map((row) => ({
    kind: row.kind,
    bannedUserId: row.user_id,
    bannedUserHash: row.user_hash,
    sanctionId: row.sanction_id,
    seenAt: row.seen_at,
  }));
}

/** Whether an address belongs to a banned or suspended account (a `+tag`, dots or another domain of the same mailbox too). */
export async function isBannedEmail(db: Executor, email: string, selfId: string | null = null): Promise<boolean> {
  return (await matchRegistry(db, [{ kind: 'email', value: email }], selfId)).length > 0;
}

/** Whether a provider subject belongs to a banned or suspended account. */
export async function isBannedOAuth(db: Executor, provider: string, subject: string, selfId: string | null = null): Promise<boolean> {
  return (await matchRegistry(db, [{ kind: 'oauth', value: `${provider}:${subject}` }], selfId)).length > 0;
}

/**
 * Re-key: rows written under an older key version, for bans still in force whose person can still be read, are
 * written again under the current version (the old rows stay and keep matching while the old key is known). Bounded;
 * runs with the retention sweep. Returns how many bans were re-registered.
 */
export async function rekeyRegistry(db: Executor, limit = 200): Promise<number> {
  const version = currentKeyVersion();
  const due = await db.query<{ sanction_id: string; user_id: string; ends_at: Date | null }>(
    `SELECT DISTINCT r.sanction_id, s.user_id, s.ends_at
       FROM ban_registry r JOIN sanctions s ON s.id = r.sanction_id
      WHERE r.key_version <> $1 AND s.user_id IS NOT NULL AND ${REGISTRY_IN_FORCE_SQL}
        AND NOT EXISTS (SELECT 1 FROM ban_registry n WHERE n.sanction_id = r.sanction_id AND n.key_version = $1)
      LIMIT $2`,
    [version, limit],
  );
  for (const d of due.rows) await registerBan(db, { sanctionId: d.sanction_id, userId: d.user_id, endsAt: d.ends_at });
  return due.rows.length;
}
