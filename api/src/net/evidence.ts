import type pg from 'pg';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * When two accounts count as "on the same device or network" — the evidence
 * behind the moderators' linked accounts and the ranks' shared-network signal.
 *
 * A shared device is a hashed device id both accounts signed up or signed in
 * with. A shared network is much weaker evidence, and used to be no evidence at
 * all: any two accounts that ever had the same address in half a year were
 * linked, and for months that address was a Cloudflare edge every caller
 * shared. Now two accounts share a network only when both of these hold:
 *
 * 1. Co-presence: both were seen on the same network (net/network-key.ts)
 *    within {@link CO_PRESENCE_HOURS} hours of each other. Having used the same
 *    café a month apart says nothing.
 * 2. A quiet network: at most {@link MAX_QUIET_CROWD} other established
 *    accounts — older than {@link ESTABLISHED_AFTER_DAYS} days at the time —
 *    were seen on it within {@link CROWD_WINDOW_DAYS} days either side. A
 *    carrier's NAT, a campus, a café, a VPN or a relay exit is seen with many
 *    accounts and drops out on its own; a home or a small office does not.
 *    Fresh accounts do not count towards the crowd, so somebody who makes a
 *    handful of new accounts at home cannot hide them from each other.
 *
 * `days` is how many distinct days the pair was co-present on a quiet network,
 * which is what tells "once, at a friend's" from "every evening". A device
 * outranks a network.
 */
export const CO_PRESENCE_HOURS = 48;
export const CROWD_WINDOW_DAYS = 7;
export const ESTABLISHED_AFTER_DAYS = 14;
export const MAX_QUIET_CROWD = 3;
/** How far back evidence is looked for. Sightings are kept 90 days, so in practice that. */
export const EVIDENCE_LOOKBACK_DAYS = 180;
/**
 * The most sightings read when counting who else was on a network in a
 * window. More than this in a fortnight — over sixty accounts — is a busy
 * network whatever their age, and is treated as crowded without reading on.
 */
export const CROWD_SCAN_ROWS = 1000;
/** Sightings read first, which settles a busy network without reading the rest. */
export const CROWD_PROBE_ROWS = 50;

/** How the evidence query sees one co-presence, or one shared-device sign-in. */
export interface EvidenceRow {
  other: string;
  via: 'device' | 'network';
  /** the UTC day it happened (`YYYY-MM-DD`) */
  day: string;
  /** the latest moment both had been there */
  at: Date;
  /** other established accounts on the network around then (device rows: 0) */
  crowd: number;
}

export interface LinkEvidence {
  via: 'device' | 'network';
  days: number;
  lastSeenTogether: string;
}

/** Both kinds of evidence for one other account, before a device outranks a network. */
export interface EvidenceKinds {
  device: { days: number; lastSeenTogether: string } | null;
  network: { days: number; lastSeenTogether: string } | null;
}

/**
 * Fold the evidence rows into both kinds of evidence per other account.
 * Network rows on a crowded network are dropped; `days` counts distinct days.
 */
export function foldEvidence(rows: readonly EvidenceRow[]): Map<string, EvidenceKinds> {
  const acc = new Map<string, Record<'device' | 'network', { days: Set<string>; at: number }>>();
  for (const r of rows) {
    if (r.via === 'network' && r.crowd > MAX_QUIET_CROWD) continue;
    let a = acc.get(r.other);
    if (!a) {
      a = { device: { days: new Set(), at: 0 }, network: { days: new Set(), at: 0 } };
      acc.set(r.other, a);
    }
    a[r.via].days.add(r.day);
    a[r.via].at = Math.max(a[r.via].at, r.at.getTime());
  }
  const kind = (k: { days: Set<string>; at: number }) =>
    k.days.size > 0 ? { days: k.days.size, lastSeenTogether: new Date(k.at).toISOString() } : null;
  const out = new Map<string, EvidenceKinds>();
  for (const [other, a] of acc) out.set(other, { device: kind(a.device), network: kind(a.network) });
  return out;
}

/** One verdict per other account: a device outranks a network. */
export function scoreEvidence(rows: readonly EvidenceRow[]): Map<string, LinkEvidence> {
  const out = new Map<string, LinkEvidence>();
  for (const [other, k] of foldEvidence(rows)) {
    if (k.device) out.set(other, { via: 'device', ...k.device });
    else if (k.network) out.set(other, { via: 'network', ...k.network });
  }
  return out;
}

/** Strongest first: a device, then the most days together, then the most recent. */
export function compareEvidence(a: LinkEvidence, b: LinkEvidence): number {
  if (a.via !== b.via) return a.via === 'device' ? -1 : 1;
  if (a.days !== b.days) return b.days - a.days;
  return b.lastSeenTogether.localeCompare(a.lastSeenTogether);
}

/** Whole days the co-presence window can reach across. */
const SPAN_DAYS = Math.ceil(CO_PRESENCE_HOURS / 24);

/**
 * The evidence rows for one account against everyone (`other` null) or against
 * one other account. One statement, two halves:
 *
 * - device: sign-ups and sign-ins (risk decisions) with a device hash this
 *   account also used, one row per other account and day;
 * - network: this account's sightings, each day a co-presence could be dated
 *   on, and how many established accounts were around then. Only quiet days are
 *   joined against other accounts' sightings, so a carrier's NAT with thousands
 *   of users costs a capped count rather than a row per stranger. When one pair
 *   is asked about, only the days the two were actually near each other are
 *   counted at all, which keeps the ranks' per-game check cheap.
 *
 * Everything is in UTC days, the same days the sightings are written in.
 */
export async function evidenceRows(db: Executor, userId: string, other: string | null = null): Promise<EvidenceRow[]> {
  const res = await db.query<{ other: string; via: 'device' | 'network'; day: string; at: Date; crowd: number }>(
    `WITH today AS (SELECT (now() AT TIME ZONE 'UTC')::date AS d),
     my_devices AS (
       SELECT device_hash, max(created_at) AS last_at FROM risk_decisions
        WHERE user_id = $1 AND device_hash IS NOT NULL AND created_at > now() - make_interval(days => $3)
        GROUP BY device_hash
     ),
     device AS (
       SELECT o.user_id AS other, (o.created_at AT TIME ZONE 'UTC')::date AS day,
              max(LEAST(o.created_at, m.last_at)) AS at
         FROM my_devices m
         JOIN risk_decisions o ON o.device_hash = m.device_hash
        WHERE o.user_id IS NOT NULL AND o.user_id <> $1 AND ($2::uuid IS NULL OR o.user_id = $2)
          AND o.created_at > now() - make_interval(days => $3)
        GROUP BY 1, 2
     ),
     mine AS MATERIALIZED (
       SELECT net_hash, day, first_at, last_at FROM network_sightings
        WHERE user_id = $1 AND day >= (SELECT d FROM today) - $3::int
     ),
     -- when one pair is asked about: the other account's sightings (none otherwise)
     theirs AS MATERIALIZED (
       SELECT net_hash, day FROM network_sightings
        WHERE user_id = $2 AND day >= (SELECT d FROM today) - $3::int - $4::int
     ),
     -- the days a co-presence on one of my networks could be dated on (the
     -- later of the two sightings); for one pair, only days they were near
     slots AS MATERIALIZED (
       SELECT DISTINCT m.net_hash, (m.day + k)::date AS day
         FROM mine m CROSS JOIN generate_series(0, $4::int) AS k
        WHERE $2::uuid IS NULL
           OR EXISTS (SELECT 1 FROM theirs o
                       WHERE o.net_hash = m.net_hash
                         AND o.day BETWEEN m.day - $4::int AND m.day + $4::int
                         AND GREATEST(m.day, o.day) = m.day + k)
     ),
     -- a first look at a few sightings around each day: a carrier's NAT shows
     -- enough established accounts at once and is not read any further
     probe AS MATERIALIZED (
       SELECT s.net_hash, s.day
         FROM slots s
         CROSS JOIN LATERAL (
           SELECT count(DISTINCT x.user_id) FILTER (
                    WHERE u.created_at < ((s.day - $6::int)::timestamp AT TIME ZONE 'UTC')) AS established
             FROM (SELECT n.user_id FROM network_sightings n
                    WHERE n.net_hash = s.net_hash AND n.day BETWEEN s.day - $5::int AND s.day + $5::int
                    LIMIT $10::int) x
             LEFT JOIN users u ON u.id = x.user_id
         ) p
        WHERE p.established <= $7::int + 2
     ),
     -- who else was on the network around each of those days, and how many
     -- were established by then (capped: past the cap it is simply busy)
     crowd AS MATERIALIZED (
       SELECT s.net_hash, s.day, c.seen, c.established
         FROM probe s
         CROSS JOIN LATERAL (
           SELECT count(*) AS seen,
                  coalesce(array_agg(DISTINCT x.user_id) FILTER (
                    WHERE u.created_at < ((s.day - $6::int)::timestamp AT TIME ZONE 'UTC')), '{}') AS established
             FROM (SELECT n.user_id FROM network_sightings n
                    WHERE n.net_hash = s.net_hash AND n.day BETWEEN s.day - $5::int AND s.day + $5::int
                    LIMIT $8::int) x
             LEFT JOIN users u ON u.id = x.user_id
         ) c
     ),
     quiet AS (
       SELECT net_hash, day, established FROM crowd
        WHERE seen < $8::int AND cardinality(established) <= $7::int + 2
     ),
     together AS (
       SELECT o.user_id AS other, m.net_hash, GREATEST(m.day, o.day) AS day, LEAST(m.last_at, o.last_at) AS at
         FROM mine m
         JOIN network_sightings o
           ON o.net_hash = m.net_hash AND o.day BETWEEN m.day - $4::int AND m.day + $4::int
        WHERE o.user_id <> $1 AND ($2::uuid IS NULL OR o.user_id = $2)
          AND o.first_at <= m.last_at + make_interval(hours => $9)
          AND m.first_at <= o.last_at + make_interval(hours => $9)
          AND EXISTS (SELECT 1 FROM quiet q WHERE q.net_hash = m.net_hash AND q.day BETWEEN m.day AND m.day + $4::int)
     )
     SELECT other, 'device' AS via, to_char(day, 'YYYY-MM-DD') AS day, at, 0 AS crowd FROM device
     UNION ALL
     SELECT t.other, 'network', to_char(t.day, 'YYYY-MM-DD'), t.at,
            cardinality(ARRAY(SELECT unnest(q.established) EXCEPT SELECT unnest(ARRAY[$1::uuid, t.other])))
       FROM together t JOIN quiet q ON q.net_hash = t.net_hash AND q.day = t.day`,
    [
      userId,
      other,
      EVIDENCE_LOOKBACK_DAYS,
      SPAN_DAYS,
      CROWD_WINDOW_DAYS,
      ESTABLISHED_AFTER_DAYS,
      MAX_QUIET_CROWD,
      CROWD_SCAN_ROWS,
      CO_PRESENCE_HOURS,
      CROWD_PROBE_ROWS,
    ],
  );
  return res.rows.map((r) => ({ other: r.other, via: r.via, day: r.day, at: r.at, crowd: Number(r.crowd) }));
}

/** Every account linked to this one, strongest first. */
export async function linkedEvidence(db: Executor, userId: string): Promise<Array<{ userId: string } & LinkEvidence>> {
  const scored = scoreEvidence(await evidenceRows(db, userId));
  return [...scored.entries()].map(([id, e]) => ({ userId: id, ...e })).sort(compareEvidence);
}

/** Both kinds of evidence between two particular accounts. */
export async function pairEvidence(db: Executor, a: string, b: string): Promise<EvidenceKinds> {
  return foldEvidence(await evidenceRows(db, a, b)).get(b) ?? { device: null, network: null };
}

/**
 * A network is busy — a carrier's NAT, a campus, a café — when more than this
 * many established accounts were seen on it in the last
 * {@link BUSY_NETWORK_DAYS} days. Sign-up risk then treats it as shared and
 * applies the softer per-network cap, so real people behind a carrier's NAT are
 * not hard-blocked because their neighbours signed up too.
 */
export const BUSY_NETWORK_ACCOUNTS = 5;
export const BUSY_NETWORK_DAYS = 30;

export async function networkIsBusy(db: Executor, netHash: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - BUSY_NETWORK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const establishedBefore = new Date(now.getTime() - ESTABLISHED_AFTER_DAYS * 86_400_000);
  const res = await db.query<{ established: number }>(
    `SELECT count(DISTINCT x.user_id) FILTER (WHERE u.created_at < $3)::int AS established
       FROM (SELECT user_id FROM network_sightings
              WHERE net_hash = $1 AND day >= $2::date
              LIMIT $4::int) x
       JOIN users u ON u.id = x.user_id`,
    [netHash, since, establishedBefore, CROWD_SCAN_ROWS],
  );
  return (res.rows[0]?.established ?? 0) > BUSY_NETWORK_ACCOUNTS;
}
