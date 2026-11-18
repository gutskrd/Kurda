import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { assessRisk, type RiskAssessment, type RiskSignals } from './score.js';
import { isDisposableEmail } from '../auth/disposable-domains.js';
import { safeLookup, type IpReputationProvider } from './ip-reputation.js';
import { networkHashOf } from '../net/network-key.js';
import { networkIsBusy } from '../net/evidence.js';
import { deleteInBatches } from '../db/batches.js';

export type RiskEvent = 'signup' | 'login';

export interface AssessInput {
  /** email is only used for the disposable-domain signal; may be omitted on login */
  email?: string;
  ip: string;
  /** Opaque client device fingerprint, hashed before storage. */
  deviceId?: string | null;
  now?: Date;
}

export interface AssessResult {
  assessment: RiskAssessment;
  signals: RiskSignals;
  decisionId: string;
}

/** Recent window for per-device/network account-creation counting (24h). */
export const RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How long logged decisions are kept. */
export const RISK_RETENTION_DAYS = 90;
/** Retention bound for network sightings (net/sightings.ts), pruned with the decisions. */
export const SIGHTING_RETENTION_DAYS = 90;

/**
 * Sign-up and sign-in risk scoring: gathers the pure engine's signals (IP reputation, degrading gracefully;
 * per-device and per-network account velocity from `risk_decisions`; request velocity from Redis; disposable email; a
 * known-good device), assesses the risk and logs the decision. Device and network values are stored only as hashes.
 * "IP" means the caller's network (net/network-key.ts), so rotating within one's /64 resets nothing; it is stored as a
 * keyed hash, since a plain hash of an IPv4 address can be reversed by trying them all.
 */
export class RiskService {
  private readonly pool: pg.Pool;
  private readonly redis?: Redis;
  private readonly ipReputation?: IpReputationProvider;
  private readonly now: () => Date;

  constructor(
    pool: pg.Pool,
    deps: { redis?: Redis; ipReputation?: IpReputationProvider; now?: () => Date } = {},
  ) {
    this.pool = pool;
    this.redis = deps.redis;
    this.ipReputation = deps.ipReputation;
    this.now = deps.now ?? (() => new Date());
  }

  assessSignup(input: AssessInput): Promise<AssessResult> {
    return this.assess('signup', input);
  }

  assessLogin(input: AssessInput): Promise<AssessResult> {
    return this.assess('login', input);
  }

  /** Attaches the created or signed-in user to a logged decision and records a sighting on its network, in one statement. */
  async attachUser(decisionId: string, userId: string): Promise<void> {
    await this.pool.query(
      `WITH d AS (
         UPDATE risk_decisions SET user_id = $2 WHERE id = $1 RETURNING net_hash, created_at
       )
       INSERT INTO network_sightings (user_id, net_hash, day, first_at, last_at)
       SELECT $2, d.net_hash, (d.created_at AT TIME ZONE 'UTC')::date, d.created_at, d.created_at
         FROM d WHERE d.net_hash IS NOT NULL
       ON CONFLICT (user_id, net_hash, day) DO UPDATE SET
         first_at = LEAST(network_sightings.first_at, EXCLUDED.first_at),
         last_at = GREATEST(network_sightings.last_at, EXCLUDED.last_at)`,
      [decisionId, userId],
    );
  }

  /** Retention prune: drops decisions older than the bound, and the network sightings with them. */
  async prune(
    olderThanDays: number = RISK_RETENTION_DAYS,
    sightingsOlderThanDays: number = SIGHTING_RETENTION_DAYS,
  ): Promise<{ decisions: number; sightings: number }> {
    const decisions = await deleteInBatches(this.pool, 'risk_decisions', `created_at < now() - make_interval(days => $1::int)`, [olderThanDays]);
    const sightings = await deleteInBatches(this.pool, 'network_sightings', `day < (now() AT TIME ZONE 'UTC')::date - $1::int`, [
      sightingsOlderThanDays,
    ]);
    return { decisions, sightings };
  }

  private async assess(event: RiskEvent, input: AssessInput): Promise<AssessResult> {
    const now = input.now ?? this.now();
    const netHash = networkHashOf(input.ip);
    const deviceHash = input.deviceId ? hash(input.deviceId) : null;
    const rep = await safeLookup(this.ipReputation, input.ip);

    // account-creation volume only gates signups; login uses velocity/reputation
    const accountsFromDeviceRecently =
      event === 'signup' && deviceHash
        ? (await this.countRecentSignups('device_hash', deviceHash, now)) + 1
        : 0;
    const accountsFromIpRecently =
      event === 'signup' ? (netHash ? await this.countRecentSignups('net_hash', netHash, now) : 0) + 1 : 0;
    // A network many established accounts use (a carrier NAT, a campus) gets the shared cap even without a reputation provider.
    const busy = event === 'signup' && netHash && !rep.sharedNetwork ? await networkIsBusy(this.pool, netHash, now) : false;

    const signals: RiskSignals = {
      ipReputation: rep.reputation,
      deviceKnownGood: deviceHash ? await this.deviceHasGoodAccount(deviceHash) : false,
      accountsFromDeviceRecently,
      accountsFromIpRecently,
      disposableEmail: input.email ? isDisposableEmail(input.email) : false,
      velocityPerMin: await this.bumpVelocity(event, netHash ?? 'unknown', now),
      geoMismatch: false, // computed once login-history geo lands (follow-up)
      sharedNetwork: rep.sharedNetwork || busy,
    };

    const assessment = assessRisk(signals);
    const decisionId = await this.record(event, netHash, deviceHash, assessment, signals);
    return { assessment, signals, decisionId };
  }

  private async record(
    event: RiskEvent,
    netHash: string | null,
    deviceHash: string | null,
    a: RiskAssessment,
    signals: RiskSignals,
  ): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO risk_decisions (event, net_hash, device_hash, score, band, action, hard_block, signals)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
      [event, netHash, deviceHash, a.score, a.band, a.action, a.hardBlock, JSON.stringify(signals)],
    );
    return res.rows[0]!.id;
  }

  private async countRecentSignups(
    column: 'device_hash' | 'net_hash',
    value: string,
    now: Date,
  ): Promise<number> {
    const since = new Date(now.getTime() - RISK_WINDOW_MS);
    const res = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM risk_decisions
       WHERE event = 'signup' AND ${column} = $1 AND created_at >= $2`,
      [value, since],
    );
    return Number(res.rows[0]?.n ?? 0);
  }

  /** A device is known good if a verified account was created from it; guests are marked verified but prove nothing, so they do not count. */
  private async deviceHasGoodAccount(deviceHash: string): Promise<boolean> {
    const res = await this.pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM risk_decisions rd
         JOIN users u ON u.id = rd.user_id
         WHERE rd.device_hash = $1 AND u.email_verified_at IS NOT NULL AND NOT u.guest
       ) AS ok`,
      [deviceHash],
    );
    return res.rows[0]?.ok ?? false;
  }

  /** Requests-per-minute from this network, via a Redis minute bucket (0 if no Redis). */
  private async bumpVelocity(event: RiskEvent, netHash: string, now: Date): Promise<number> {
    if (!this.redis) return 0;
    const minute = Math.floor(now.getTime() / 60_000);
    const key = `risk:vel:${event}:${netHash}:${minute}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 120);
    return count;
  }
}

/**
 * SHA-256 hex of a device id, so the raw id is never stored. Device ids are opaque client values, not enumerable like
 * addresses, and existing decisions match on this hash, so it stays unkeyed.
 */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
