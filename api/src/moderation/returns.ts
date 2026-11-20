import type pg from 'pg';
import type { AccountHold, BanContentChoice, ReportCategory, SanctionKind } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { linkedEvidence, networkIsBusy } from '../net/evidence.js';
import { networkHashOf } from '../net/network-key.js';
import { availableSql } from './availability.js';
import { matchRegistry, type Probe } from './ban-registry.js';
import { deviceHashOf } from './identity-hash.js';
import { userHash } from './pseudonym.js';
import {
  NEAR_BAN_DAYS,
  REPEATED_DAYS,
  scoreReturn,
  strongerLevel,
  type ObservedSignal,
  type ReturnLevel,
  type SignalStrength,
  type WeighedSignal,
} from './return-score.js';
import { logAdminAction } from './sanctions-service.js';
import { SAFETY_CATEGORY } from './notices.js';
import { inTransaction, type Executor } from './tx.js';

/**
 * Possible returns: accounts that may belong to someone who is banned or suspended, found by the signals they share
 * (return-score.ts has the table), for a person to decide.
 *
 * - Checked at sign-up, guest creation, claiming a guest, a provider sign-in, a sign-in on a new device, verifying a
 *   phone and registering for push, and daily for the banned person's networks (`sweepRepeated`).
 * - The same identity is refused before the account exists (`isReturningIdentity`, the generic sign-up refusal); a
 *   strong match holds the account (it can learn, not post, message, upload, write letters or join groups) and queues
 *   it; a medium one only queues it; a network alone does nothing.
 * - A moderator decides: the same person (the ban is applied to this account too, with its own notice and appeal), or
 *   not (the hold ends and the pair is never flagged again). Every decision is audited.
 * - A held person can ask for a person to look (`requestReview`); lifting the banned person's ban ends the holds it
 *   caused (`closeReturnsOf`).
 */

/** The most entries a page of the queue or the user page's panel shows. */
export const RETURNS_PAGE_MAX = 50;
/** The most signals one entry keeps, strongest and newest first. */
export const MAX_SIGNALS_PER_ENTRY = 20;
/** The most banned accounts one check compares against. */
export const MAX_CANDIDATES = 20;
/** How far back a banned person's networks are taken around their ban. */
export const NETWORK_LOOKBACK_DAYS = 30;

export type ReturnEvent = 'signup' | 'guest' | 'claim' | 'oauth' | 'signin' | 'phone' | 'push' | 'sweep';

/** What is known of the account being checked, as the event that triggered it sends it. */
export interface ReturnProbe {
  userId: string;
  event: ReturnEvent;
  email?: string | null;
  oauth?: { provider: string; subject: string } | null;
  /** E.164 */
  phone?: string | null;
  /** the app's raw install id */
  deviceId?: string | null;
  pushToken?: string | null;
  ip?: string | null;
}

/** A signal as an entry keeps it. */
export interface StoredSignal extends WeighedSignal {
  /** the event it was seen at */
  event: ReturnEvent;
}

export interface ReturnsOptions {
  /** networks a superadmin vouched for are shared, never quiet (trusted-networks.ts) */
  isTrusted?: (db: Executor, netHash: string) => Promise<boolean>;
  log?: { warn: (obj: unknown, msg: string) => void };
}

/**
 * Whether an address, provider subject or phone number belongs to someone banned or suspended now. Sign-up, claiming a
 * guest and a new provider account answer it with the generic refusal; verifying a phone, with the usual "can't use
 * this number".
 */
export async function isReturningIdentity(
  db: Executor,
  identity: { email?: string | null; oauth?: { provider: string; subject: string } | null; phone?: string | null },
  selfId: string | null = null,
): Promise<boolean> {
  const probes: Probe[] = [];
  if (identity.email) probes.push({ kind: 'email', value: identity.email });
  if (identity.oauth) probes.push({ kind: 'oauth', value: `${identity.oauth.provider}:${identity.oauth.subject}` });
  if (identity.phone) probes.push({ kind: 'phone', value: identity.phone });
  if (probes.length === 0) return false;
  return (await matchRegistry(db, probes, selfId)).length > 0;
}

interface Candidate {
  bannedUserId: string | null;
  bannedUserHash: string;
  sanctionId: string | null;
  signals: ObservedSignal[];
}

const DAY_MS = 86_400_000;

/** The banned accounts this probe shares a registry signal with, by account. */
async function registryCandidates(db: Executor, probe: ReturnProbe, into: Map<string, Candidate>, now: Date): Promise<void> {
  const probes: Probe[] = [];
  if (probe.email) probes.push({ kind: 'email', value: probe.email });
  if (probe.oauth) probes.push({ kind: 'oauth', value: `${probe.oauth.provider}:${probe.oauth.subject}` });
  if (probe.phone) probes.push({ kind: 'phone', value: probe.phone });
  if (probe.deviceId) probes.push({ kind: 'device', value: deviceHashOf(probe.deviceId) });
  if (probe.pushToken) probes.push({ kind: 'push', value: probe.pushToken });
  if (probes.length === 0) return;
  for (const m of await matchRegistry(db, probes, probe.userId)) {
    const key = m.bannedUserHash ?? m.sanctionId;
    const c = into.get(key) ?? { bannedUserId: m.bannedUserId, bannedUserHash: key, sanctionId: m.sanctionId, signals: [] };
    const seen = m.seenAt ?? now;
    c.signals.push({ kind: m.kind, at: seen.toISOString(), ...(m.kind === 'device' ? { ageDays: Math.floor((now.getTime() - seen.getTime()) / DAY_MS) } : {}) });
    into.set(key, c);
  }
}

/**
 * Banned accounts whose ban began within NEAR_BAN_DAYS and who were on this network in the month before it (or tried to
 * sign in from it since), with their time zone and language. One indexed read of the network's sightings.
 */
async function nearBanCandidates(db: Executor, probe: ReturnProbe, opts: ReturnsOptions, into: Map<string, Candidate>, now: Date): Promise<void> {
  const netHash = networkHashOf(probe.ip ?? null);
  if (!netHash) return;
  const r = await db.query<{ user_id: string; sanction_id: string; starts_at: Date; timezone: string; locale: string; seen: Date; me_tz: string; me_locale: string }>(
    `SELECT DISTINCT ON (b.user_id) b.user_id, b.id AS sanction_id, b.starts_at, u.timezone, u.locale, ns.last_at AS seen,
            me.timezone AS me_tz, me.locale AS me_locale
       FROM network_sightings ns
       JOIN sanctions b ON b.user_id = ns.user_id AND b.kind IN ('suspension','permanent_ban') AND b.revoked_at IS NULL
                       AND (b.ends_at IS NULL OR b.ends_at > now()) AND b.starts_at > now() - make_interval(days => $3::int)
       JOIN users u ON u.id = b.user_id
       JOIN users me ON me.id = $2
      WHERE ns.net_hash = $1 AND ns.user_id <> $2
        AND ns.day >= (b.starts_at AT TIME ZONE 'UTC')::date - $4::int
      ORDER BY b.user_id, b.starts_at, ns.last_at DESC
      LIMIT $5`,
    [netHash, probe.userId, NEAR_BAN_DAYS, NETWORK_LOOKBACK_DAYS, MAX_CANDIDATES],
  );
  if (r.rows.length === 0) return;
  const quiet = !(await networkIsBusy(db, netHash, now)) && !(await opts.isTrusted?.(db, netHash));
  for (const row of r.rows) {
    const key = userHash(row.user_id);
    const c = into.get(key) ?? { bannedUserId: row.user_id, bannedUserHash: key, sanctionId: row.sanction_id, signals: [] };
    c.signals.push({
      kind: 'network_near_ban',
      at: row.seen.toISOString(),
      network: {
        quiet,
        daysAfterBan: Math.floor((now.getTime() - row.starts_at.getTime()) / DAY_MS),
        separateDays: 1,
        sameTimeZone: row.timezone === row.me_tz,
        sameLanguage: row.locale === row.me_locale,
      },
    });
    into.set(key, c);
  }
}

/**
 * Banned accounts the probe's account shares evidence with over time (net/evidence.ts): an install id both used, or a
 * quiet network both were on, on separate days. Read at a sign-in on a new device and by the sweep, where an account
 * has history to compare.
 */
async function evidenceCandidates(db: Executor, userId: string, into: Map<string, Candidate>): Promise<void> {
  const linked = await linkedEvidence(db, userId);
  if (linked.length === 0) return;
  const banned = await db.query<{ id: string; sanction_id: string }>(
    `SELECT DISTINCT ON (u.id) u.id, s.id AS sanction_id FROM users u
       JOIN sanctions s ON s.user_id = u.id AND s.kind IN ('suspension','permanent_ban') AND s.revoked_at IS NULL
                        AND (s.ends_at IS NULL OR s.ends_at > now())
      WHERE u.id = ANY($1::uuid[])
      ORDER BY u.id, s.created_at DESC`,
    [linked.slice(0, 200).map((l) => l.userId)],
  );
  const bySanction = new Map(banned.rows.map((b) => [b.id, b.sanction_id]));
  for (const l of linked) {
    const sanctionId = bySanction.get(l.userId);
    if (!sanctionId) continue;
    const key = userHash(l.userId);
    const c = into.get(key) ?? { bannedUserId: l.userId, bannedUserHash: key, sanctionId, signals: [] };
    if (l.via === 'device') c.signals.push({ kind: 'device', at: l.lastSeenTogether, ageDays: 0 });
    else {
      c.signals.push({
        kind: l.days >= REPEATED_DAYS ? 'network_repeated' : 'network',
        at: l.lastSeenTogether,
        network: { quiet: true, daysAfterBan: null, separateDays: l.days, sameTimeZone: false, sameLanguage: false },
      });
    }
    into.set(key, c);
  }
}

/** Two signals are one when they are the same kind seen the same way; the newer is kept. */
function signalKey(s: ObservedSignal): string {
  return s.network ? `${s.kind}:${s.network.daysAfterBan ?? ''}:${s.network.separateDays}` : s.kind;
}

function mergeSignals(old: StoredSignal[], fresh: StoredSignal[]): StoredSignal[] {
  const byKey = new Map<string, StoredSignal>();
  for (const s of [...old, ...fresh]) {
    const k = signalKey(s);
    const had = byKey.get(k);
    if (!had || had.at < s.at) byKey.set(k, s);
  }
  return [...byKey.values()];
}

/** The level a set of stored signals reaches, and the signals capped, strongest and newest first. */
function rescore(signals: StoredSignal[]): { level: ReturnLevel; signals: StoredSignal[] } {
  const scored = scoreReturn(signals);
  const events = new Map(signals.map((s) => [signalKey(s), s.event]));
  return {
    level: scored.level,
    signals: scored.signals.slice(0, MAX_SIGNALS_PER_ENTRY).map((s) => ({ ...s, event: events.get(signalKey(s)) ?? 'sweep' })),
  };
}

const HELD_NOTICE = {
  title: 'Your account is being checked',
  body: 'Your account is being checked before you can post or message. Learning works as usual. You can ask for a person to look from Account standing.',
};
const CLEARED_NOTICE = {
  title: 'Your account check is done',
  body: 'Thanks for waiting. You can post and message again.',
};

export interface AssessedReturn {
  level: ReturnLevel;
  /** the account is held now (by this check or an earlier one) */
  held: boolean;
}

/** Whether a check of this kind reads the account's history: a new account has none, and a phone or push check is about one value. */
function readsHistory(event: ReturnEvent): boolean {
  return event === 'signin' || event === 'sweep';
}

/**
 * Check an account against everyone banned or suspended now, record what matched, and hold it on a strong match. An
 * existing account that matches an identity is held rather than refused, since it was not made to get round the ban.
 * Never throws for a failed check: sign-up and sign-in must not fail because of it (the caller logs).
 */
export async function assessReturn(pool: pg.Pool, probe: ReturnProbe, opts: ReturnsOptions = {}): Promise<AssessedReturn> {
  const now = new Date();
  const candidates = new Map<string, Candidate>();
  await registryCandidates(pool, probe, candidates, now);
  if (probe.ip) await nearBanCandidates(pool, probe, opts, candidates, now);
  if (readsHistory(probe.event)) await evidenceCandidates(pool, probe.userId, candidates);
  if (candidates.size === 0) return { level: 'none', held: false };
  return recordCandidates(pool, probe.userId, probe.event, [...candidates.values()].slice(0, MAX_CANDIDATES));
}

/** Write what matched, per banned account, and hold the account on a strong match; in one transaction. */
async function recordCandidates(pool: pg.Pool, userId: string, event: ReturnEvent, candidates: Candidate[]): Promise<AssessedReturn> {
  return inTransaction(pool, async (client) => {
    const me = await client.query<{ held_at: Date | null; deleted_at: Date | null; banned: boolean }>(
      `SELECT held_at, deleted_at, NOT ${availableSql('users')} AS banned FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const row = me.rows[0];
    // an account already banned or closed needs no hold
    if (!row || row.deleted_at || row.banned) return { level: 'none', held: false };
    const existing = await client.query<{ banned_user_hash: string; status: string; signals: StoredSignal[]; held: boolean }>(
      `SELECT banned_user_hash, status, signals, held FROM possible_returns WHERE user_id = $1 AND banned_user_hash = ANY($2::text[])`,
      [userId, candidates.map((c) => c.bannedUserHash)],
    );
    const known = new Map(existing.rows.map((e) => [e.banned_user_hash, e]));
    let best: ReturnLevel = 'none';
    let holds = false;
    for (const c of candidates) {
      const had = known.get(c.bannedUserHash);
      // decided once, decided: a pair cleared is never flagged again, and a pair found the same person is banned already
      if (had && (had.status === 'not_same_person' || had.status === 'same_person')) continue;
      const fresh = scoreReturn(c.signals).signals.map((s) => ({ ...s, event }));
      const merged = rescore(mergeSignals(had?.signals ?? [], fresh));
      if (merged.level === 'none') continue;
      const strength = merged.level === 'medium' ? 'medium' : 'strong';
      const hold = strength === 'strong';
      best = strongerLevel(best, merged.level);
      holds ||= hold;
      await client.query(
        `INSERT INTO possible_returns (user_id, banned_user_id, banned_user_hash, sanction_id, strength, signals, held)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (user_id, banned_user_hash) DO UPDATE SET
           banned_user_id = COALESCE(EXCLUDED.banned_user_id, possible_returns.banned_user_id),
           sanction_id = COALESCE(EXCLUDED.sanction_id, possible_returns.sanction_id),
           strength = EXCLUDED.strength, signals = EXCLUDED.signals,
           held = possible_returns.held OR EXCLUDED.held, status = 'open', last_seen_at = now()
         WHERE possible_returns.status IN ('open','closed')`,
        [userId, c.bannedUserId, c.bannedUserHash, c.sanctionId, strength, JSON.stringify(merged.signals), hold],
      );
    }
    if (holds && row.held_at === null) {
      await client.query(`UPDATE users SET held_at = now(), hold_reason = 'possible_return' WHERE id = $1 AND held_at IS NULL`, [userId]);
      await inboxNotice(client, userId, HELD_NOTICE, 'account_held');
      await logAdminAction(client, {
        targetUserId: userId,
        adminId: null,
        action: 'possible_return_hold',
        reason: `held at ${event}: may be the same person as a banned account`,
        meta: { event, level: best },
      });
    }
    return { level: best, held: holds || row.held_at !== null };
  });
}

/** Lift the hold when no open strong entry is left, and tell the person. In the caller's transaction. */
export async function liftHoldIfClear(db: Executor, userId: string): Promise<boolean> {
  const r = await db.query<{ id: string }>(
    `UPDATE users SET held_at = NULL, hold_reason = NULL
      WHERE id = $1 AND held_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM possible_returns p WHERE p.user_id = $1 AND p.status = 'open' AND p.strength = 'strong')
      RETURNING id`,
    [userId],
  );
  if (!r.rowCount) return false;
  await inboxNotice(db, userId, CLEARED_NOTICE, 'account_hold_lifted');
  return true;
}

/** A line in the person's inbox about their hold; the apps write their own words from `data.kind`. */
async function inboxNotice(db: Executor, userId: string, notice: { title: string; body: string }, kind: string): Promise<void> {
  await db.query(`INSERT INTO notifications (user_id, category, title, body, data) VALUES ($1, $2, $3, $4, $5::jsonb)`, [
    userId,
    SAFETY_CATEGORY,
    notice.title,
    notice.body,
    JSON.stringify({ kind }),
  ]);
}

/**
 * A banned person's ban no longer in force (lifted, overturned, lapsed): open entries about them close, and the holds
 * they caused end. In the caller's transaction, after the enforced columns are synced.
 */
export async function closeReturnsOf(db: Executor, bannedUserId: string): Promise<number> {
  const still = await db.query(
    `SELECT 1 FROM sanctions s WHERE s.user_id = $1 AND s.kind IN ('suspension','permanent_ban') AND s.revoked_at IS NULL
        AND (s.ends_at IS NULL OR s.ends_at > now()) LIMIT 1`,
    [bannedUserId],
  );
  if (still.rowCount) return 0;
  const closed = await db.query<{ user_id: string }>(
    `UPDATE possible_returns SET status = 'closed', decided_at = now(), decision_note = 'the ban is no longer in force'
      WHERE banned_user_id = $1 AND status = 'open' RETURNING user_id`,
    [bannedUserId],
  );
  for (const u of new Set(closed.rows.map((c) => c.user_id))) await liftHoldIfClear(db, u);
  return closed.rowCount ?? 0;
}

/** What GET /me says of a hold. */
export function accountHoldOf(row: { held_at: Date | null; hold_reason: string | null }): AccountHold | null {
  return row.held_at && row.hold_reason === 'possible_return' ? { reason: 'possible_return', since: row.held_at.toISOString() } : null;
}

// ---------------------------------------------------------------------------
// What moderators see and decide
// ---------------------------------------------------------------------------

export interface ReturnPerson {
  id: string;
  username: string;
  createdAt: string;
  /** suspended or banned now */
  unavailable: boolean;
  held: boolean;
}

export interface ReturnBan {
  sanctionId: string;
  kind: SanctionKind;
  policy: ReportCategory;
  startsAt: string;
  endsAt: string | null;
}

export interface PossibleReturnItem {
  id: string;
  account: ReturnPerson | null;
  banned: (ReturnPerson & { ban: ReturnBan | null }) | null;
  strength: 'strong' | 'medium';
  signals: Array<{ kind: string; strength: SignalStrength; at: string; event: ReturnEvent }>;
  held: boolean;
  status: 'open' | 'same_person' | 'not_same_person' | 'closed';
  firstSeenAt: string;
  lastSeenAt: string;
  personNote: { text: string; at: string } | null;
  decision: { byUsername: string | null; at: string; note: string | null; linkedSanctionId: string | null } | null;
}

interface ReturnRow {
  id: string;
  user_id: string;
  banned_user_id: string | null;
  sanction_id: string | null;
  strength: 'strong' | 'medium';
  signals: StoredSignal[];
  held: boolean;
  status: PossibleReturnItem['status'];
  first_seen_at: Date;
  last_seen_at: Date;
  person_note: string | null;
  person_note_at: Date | null;
  decided_at: Date | null;
  decision_note: string | null;
  linked_sanction_id: string | null;
  a_username: string | null;
  a_created_at: Date | null;
  a_unavailable: boolean | null;
  a_held: boolean | null;
  b_username: string | null;
  b_created_at: Date | null;
  b_unavailable: boolean | null;
  b_held: boolean | null;
  ban_kind: SanctionKind | null;
  ban_policy: ReportCategory | null;
  ban_starts: Date | null;
  ban_ends: Date | null;
  decider: string | null;
}

const RETURN_SELECT = `
  SELECT p.*, a.username AS a_username, a.created_at AS a_created_at, NOT ${availableSql('a')} AS a_unavailable, a.held_at IS NOT NULL AS a_held,
         b.username AS b_username, b.created_at AS b_created_at, NOT ${availableSql('b')} AS b_unavailable, b.held_at IS NOT NULL AS b_held,
         s.kind AS ban_kind, s.policy AS ban_policy, s.starts_at AS ban_starts, s.ends_at AS ban_ends, d.username AS decider
    FROM possible_returns p
    LEFT JOIN users a ON a.id = p.user_id
    LEFT JOIN users b ON b.id = p.banned_user_id
    LEFT JOIN sanctions s ON s.id = p.sanction_id
    LEFT JOIN users d ON d.id = p.decided_by`;

function toItem(r: ReturnRow): PossibleReturnItem {
  const person = (id: string | null, username: string | null, created: Date | null, unavailable: boolean | null, held: boolean | null): ReturnPerson | null =>
    id && username && created ? { id, username, createdAt: created.toISOString(), unavailable: unavailable === true, held: held === true } : null;
  const banned = person(r.banned_user_id, r.b_username, r.b_created_at, r.b_unavailable, r.b_held);
  return {
    id: r.id,
    account: person(r.user_id, r.a_username, r.a_created_at, r.a_unavailable, r.a_held),
    banned: banned
      ? {
          ...banned,
          ban:
            r.sanction_id && r.ban_kind && r.ban_policy && r.ban_starts
              ? { sanctionId: r.sanction_id, kind: r.ban_kind, policy: r.ban_policy, startsAt: r.ban_starts.toISOString(), endsAt: r.ban_ends?.toISOString() ?? null }
              : null,
        }
      : null,
    strength: r.strength,
    signals: (r.signals ?? []).map((s) => ({ kind: s.kind, strength: s.strength, at: s.at, event: s.event })),
    held: r.held,
    status: r.status,
    firstSeenAt: r.first_seen_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    personNote: r.person_note && r.person_note_at ? { text: r.person_note, at: r.person_note_at.toISOString() } : null,
    decision: r.decided_at ? { byUsername: r.decider, at: r.decided_at.toISOString(), note: r.decision_note, linkedSanctionId: r.linked_sanction_id } : null,
  };
}

/** A page cursor: the last entry's time and id. */
function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('BAD_CURSOR', 400, 'that page marker is not valid');
  return { at, id };
}

export interface LinkedBanInput {
  kind: 'suspension' | 'permanent_ban';
  policy: ReportCategory;
  statement: string;
  durationHours: number | null;
  internalNote: string | null;
  confirmUsername?: string;
  content: { choice: BanContentChoice; includeMessages: boolean };
  meta: Record<string, unknown>;
}

/** How "Same person" bans the account: the user page's ban, with its rules (cases-service.ts `sanctionUser`). */
export type LinkedBanner = (adminId: string, userId: string, input: LinkedBanInput) => Promise<{ sanctionIds: string[]; pendingApproval: boolean }>;

export type ReturnDecision =
  | { decision: 'not_same_person'; note: string }
  | {
      decision: 'same_person';
      note: string;
      statement: string;
      policy?: ReportCategory;
      content?: { choice: BanContentChoice; includeMessages: boolean };
      confirmUsername?: string;
    };

export class PossibleReturnsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly opts: ReturnsOptions & { banner?: LinkedBanner } = {},
  ) {}

  useBanner(banner: LinkedBanner): void {
    this.opts.banner = banner;
  }

  /** Check an account; a failure is logged and the account goes on as if nothing matched. */
  async assess(probe: ReturnProbe): Promise<AssessedReturn> {
    try {
      return await assessReturn(this.pool, probe, this.opts);
    } catch (err) {
      this.opts.log?.warn({ err, event: probe.event }, 'checking an account against banned ones failed');
      return { level: 'none', held: false };
    }
  }

  /** The queue, a page at a time: held accounts first, then the newest. */
  async list(input: { status?: PossibleReturnItem['status'] | 'all'; cursor?: string; limit?: number }): Promise<{ items: PossibleReturnItem[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(input.limit ?? RETURNS_PAGE_MAX, 1), RETURNS_PAGE_MAX);
    const after = decodeCursor(input.cursor);
    const status = input.status ?? 'open';
    const r = await this.pool.query<ReturnRow>(
      `${RETURN_SELECT}
        WHERE ($1::text = 'all' OR p.status = $1)
          AND ($2::timestamptz IS NULL OR (p.last_seen_at, p.id) < ($2::timestamptz, $3::uuid))
        ORDER BY p.last_seen_at DESC, p.id DESC
        LIMIT $4`,
      [status, after?.at ?? null, after?.id ?? null, limit + 1],
    );
    const rows = r.rows.slice(0, limit);
    const last = rows.at(-1);
    return { items: rows.map(toItem), nextCursor: r.rows.length > limit && last ? encodeCursor(last.last_seen_at, last.id) : null };
  }

  /** How many wait for a person, for the console's navigation. */
  async openCount(): Promise<{ open: number; held: number }> {
    const r = await this.pool.query<{ open: number; held: number }>(
      `SELECT count(*)::int AS open, count(*) FILTER (WHERE strength = 'strong')::int AS held FROM possible_returns WHERE status = 'open'`,
    );
    return r.rows[0] ?? { open: 0, held: 0 };
  }

  /**
   * "Possibly the same person as…" for one account: entries where it may be someone's return, entries where others may
   * be its return, and every account it shares a device or quiet network with (net/evidence.ts), a page at a time.
   */
  async panel(userId: string, input: { offset?: number; limit?: number }): Promise<{ items: PanelEntry[]; total: number; nextOffset: number | null }> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), RETURNS_PAGE_MAX);
    const offset = Math.max(input.offset ?? 0, 0);
    const [entries, evidence] = await Promise.all([
      this.pool.query<ReturnRow>(
        `${RETURN_SELECT} WHERE p.user_id = $1 OR p.banned_user_id = $1 ORDER BY p.last_seen_at DESC LIMIT 500`,
        [userId],
      ),
      linkedEvidence(this.pool, userId),
    ]);
    const items: PanelEntry[] = [];
    const listed = new Set<string>();
    for (const row of entries.rows) {
      const item = toItem(row);
      const theyMayBe = row.user_id === userId;
      const other = theyMayBe ? item.banned : item.account;
      if (!other) continue;
      listed.add(other.id);
      items.push({
        other,
        relation: theyMayBe ? 'may_be_return_of' : 'may_have_returned_as',
        entryId: item.id,
        status: item.status,
        strength: item.strength,
        signals: item.signals,
        lastSeenAt: item.lastSeenAt,
      });
    }
    const unlisted = evidence.filter((e) => !listed.has(e.userId));
    if (unlisted.length > 0) {
      const people = await this.pool.query<{ id: string; username: string; created_at: Date; unavailable: boolean; held: boolean }>(
        `SELECT id, username, created_at, NOT ${availableSql('users')} AS unavailable, held_at IS NOT NULL AS held FROM users WHERE id = ANY($1::uuid[])`,
        [unlisted.map((e) => e.userId)],
      );
      const byId = new Map(people.rows.map((p) => [p.id, p]));
      for (const e of unlisted) {
        const p = byId.get(e.userId);
        if (!p) continue;
        items.push({
          other: { id: p.id, username: p.username, createdAt: p.created_at.toISOString(), unavailable: p.unavailable, held: p.held },
          relation: 'shares_evidence',
          entryId: null,
          status: null,
          strength: e.via === 'device' ? 'strong' : e.days >= REPEATED_DAYS ? 'medium' : 'weak',
          signals: [{ kind: e.via === 'device' ? 'device' : e.days >= REPEATED_DAYS ? 'network_repeated' : 'network', strength: e.via === 'device' ? 'strong' : e.days >= REPEATED_DAYS ? 'medium' : 'weak', at: e.lastSeenTogether, event: 'sweep', days: e.days }],
          lastSeenAt: e.lastSeenTogether,
        });
      }
    }
    const page = items.slice(offset, offset + limit);
    return { items: page, total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
  }

  /**
   * Decide an entry. Same person: the banned person's ban is applied to this account as well (a suspension for what is
   * left of theirs), linked, with its own notice and appeal, under the user page's rules for a permanent ban. Not the
   * same person: the hold ends unless another strong entry remains, and the pair is never flagged again.
   */
  async decide(entryId: string, adminId: string, input: ReturnDecision): Promise<PossibleReturnItem> {
    const note = input.note.trim();
    if (!note) throw new AppError('NOTE_REQUIRED', 400, 'say why');
    const found = await this.pool.query<ReturnRow>(`${RETURN_SELECT} WHERE p.id = $1`, [entryId]);
    const entry = found.rows[0];
    if (!entry) throw new AppError('NOT_FOUND', 404, 'no such entry');
    if (entry.status !== 'open') throw new AppError('ALREADY_DECIDED', 409, 'this entry was already decided');
    // nobody decides about themselves, either side of the pair
    if (entry.user_id === adminId || entry.banned_user_id === adminId) {
      throw new AppError('CONFLICT_OF_INTEREST', 403, 'this is about you; another moderator must decide it');
    }

    if (input.decision === 'not_same_person') {
      await inTransaction(this.pool, async (client) => {
        const upd = await client.query(
          `UPDATE possible_returns SET status = 'not_same_person', decided_by = $2, decided_at = now(), decision_note = $3
            WHERE id = $1 AND status = 'open'`,
          [entryId, adminId, note.slice(0, 2000)],
        );
        if (!upd.rowCount) throw new AppError('ALREADY_DECIDED', 409, 'this entry was already decided');
        await liftHoldIfClear(client, entry.user_id);
        await logAdminAction(client, {
          targetUserId: entry.user_id,
          adminId,
          action: 'possible_return_cleared',
          reason: note,
          meta: { entryId, bannedUserHash: userHash(entry.banned_user_id ?? ''), strength: entry.strength },
        });
      });
      return (await this.find(entryId))!;
    }

    if (!this.opts.banner) throw new AppError('UNAVAILABLE', 503, 'banning is not wired');
    if (!entry.sanction_id || !entry.ban_kind || (entry.ban_kind !== 'suspension' && entry.ban_kind !== 'permanent_ban')) {
      throw new AppError('BAN_NOT_IN_FORCE', 409, 'the banned account’s ban is no longer in force');
    }
    const ban = await this.pool.query<{ live: boolean; ends_at: Date | null; policy: ReportCategory }>(
      `SELECT revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now()) AS live, ends_at, policy FROM sanctions WHERE id = $1`,
      [entry.sanction_id],
    );
    const b = ban.rows[0];
    if (!b?.live) throw new AppError('BAN_NOT_IN_FORCE', 409, 'the banned account’s ban is no longer in force');
    const durationHours = entry.ban_kind === 'suspension' && b.ends_at ? Math.max(1, Math.ceil((b.ends_at.getTime() - Date.now()) / 3_600_000)) : null;
    const applied = await this.opts.banner(adminId, entry.user_id, {
      kind: entry.ban_kind,
      policy: input.policy ?? b.policy,
      statement: input.statement,
      durationHours,
      internalNote: note,
      confirmUsername: input.confirmUsername,
      content: input.content ?? { choice: 'keep', includeMessages: false },
      meta: { linkedTo: entry.sanction_id, possibleReturnId: entryId },
    });
    await inTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE possible_returns SET status = 'same_person', decided_by = $2, decided_at = now(), decision_note = $3, linked_sanction_id = $4
          WHERE id = $1`,
        [entryId, adminId, note.slice(0, 2000), applied.sanctionIds.at(-1) ?? null],
      );
      // the ban takes over from the hold; whatever else was open about this account is settled with it
      await client.query(
        `UPDATE possible_returns SET status = 'closed', decided_at = now(), decision_note = 'found the same person as another banned account'
          WHERE user_id = $1 AND status = 'open'`,
        [entry.user_id],
      );
      await client.query(`UPDATE users SET held_at = NULL, hold_reason = NULL WHERE id = $1`, [entry.user_id]);
      await logAdminAction(client, {
        targetUserId: entry.user_id,
        adminId,
        action: 'possible_return_same',
        reason: note,
        sanctionId: applied.sanctionIds.at(-1) ?? null,
        meta: { entryId, linkedTo: entry.sanction_id, pendingApproval: applied.pendingApproval },
      });
    });
    return (await this.find(entryId))!;
  }

  async find(entryId: string): Promise<PossibleReturnItem | null> {
    const r = await this.pool.query<ReturnRow>(`${RETURN_SELECT} WHERE p.id = $1`, [entryId]);
    return r.rows[0] ? toItem(r.rows[0]) : null;
  }

  /** The held person asks for a person to look, once per hold; their words go on every open entry that holds them. */
  async requestReview(userId: string, text: string): Promise<{ requested: boolean }> {
    const clean = text.trim().slice(0, 2000);
    if (!clean) throw new AppError('TEXT_REQUIRED', 400, 'say what a person should know');
    const r = await this.pool.query(
      `UPDATE possible_returns SET person_note = $2, person_note_at = now()
        WHERE user_id = $1 AND status = 'open' AND strength = 'strong' AND person_note IS NULL`,
      [userId, clean],
    );
    if (!r.rowCount) {
      const held = await this.pool.query(`SELECT 1 FROM users WHERE id = $1 AND held_at IS NOT NULL`, [userId]);
      if (!held.rowCount) throw new AppError('NOT_HELD', 409, 'your account is not being checked');
      throw new AppError('ALREADY_REQUESTED', 409, 'you already asked; a person will look');
    }
    return { requested: true };
  }

  /**
   * The daily look at banned people's networks: accounts seen on a quiet network a banned person used in the month up
   * to their ban, on separate days since, are checked with their history (`assessReturn`). Bounded per run.
   */
  async sweepRepeated(limit = 200): Promise<number> {
    const r = await this.pool.query<{ other: string }>(
      `WITH banned AS (
         SELECT DISTINCT ON (s.user_id) s.user_id, s.starts_at FROM sanctions s
          WHERE s.kind IN ('suspension','permanent_ban') AND s.revoked_at IS NULL AND (s.ends_at IS NULL OR s.ends_at > now())
            AND s.user_id IS NOT NULL AND s.starts_at > now() - interval '90 days'
          ORDER BY s.user_id, s.starts_at
          LIMIT 500
       ), nets AS (
         SELECT DISTINCT b.user_id, b.starts_at, ns.net_hash FROM banned b
           JOIN network_sightings ns ON ns.user_id = b.user_id AND ns.day >= (b.starts_at AT TIME ZONE 'UTC')::date - $2::int
       )
       SELECT o.user_id AS other FROM nets n
         JOIN network_sightings o ON o.net_hash = n.net_hash AND o.day >= (n.starts_at AT TIME ZONE 'UTC')::date AND o.user_id <> n.user_id
         JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL AND ${availableSql('u')}
        WHERE NOT EXISTS (SELECT 1 FROM possible_returns p WHERE p.user_id = o.user_id AND p.banned_user_id = n.user_id AND p.status <> 'open')
        GROUP BY o.user_id
       HAVING count(DISTINCT o.day) >= $3
        LIMIT $1`,
      [limit, NETWORK_LOOKBACK_DAYS, REPEATED_DAYS],
    );
    for (const { other } of r.rows) await this.assess({ userId: other, event: 'sweep' });
    return r.rows.length;
  }
}

export interface PanelEntry {
  other: ReturnPerson;
  relation: 'may_be_return_of' | 'may_have_returned_as' | 'shares_evidence';
  entryId: string | null;
  status: PossibleReturnItem['status'] | null;
  strength: SignalStrength;
  signals: Array<{ kind: string; strength: SignalStrength; at: string; event: ReturnEvent; days?: number }>;
  lastSeenAt: string;
}
