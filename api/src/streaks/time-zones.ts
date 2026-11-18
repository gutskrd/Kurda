import type pg from 'pg';
import { safeTimeZone } from './streak-logic.js';

/**
 * Which time zones an account may be given: ones both Intl (`safeTimeZone`) and the database accept. Intl takes names
 * Postgres may not know (old abbreviations, `SystemV/…`, a bare `+0530`, dropped links), and one stored would fail
 * every query of the account's day, the hourly reminders for everyone included. Postgres's list depends on how the
 * server was built, so it is read from the database rather than written here.
 */

/** The time zones each database knows, read once per pool: they change only with a new server. */
const known = new WeakMap<object, Promise<ReadonlySet<string>>>();

export function databaseTimeZones(db: Pick<pg.Pool, 'query'>): Promise<ReadonlySet<string>> {
  let zones = known.get(db);
  if (!zones) {
    zones = db.query<{ name: string }>(`SELECT name FROM pg_timezone_names`).then((r) => new Set(r.rows.map((row) => row.name)));
    // a read that failed is tried again next time, not remembered
    zones.catch(() => known.delete(db));
    known.set(db, zones);
  }
  return zones;
}

/** `timeZone` when an account may be given it, or null. */
export async function storableTimeZone(db: Pick<pg.Pool, 'query'>, timeZone: string): Promise<string | null> {
  if (safeTimeZone(timeZone) !== timeZone) return null;
  return (await databaseTimeZones(db)).has(timeZone) ? timeZone : null;
}

/** What a request is told about a time zone it may not set. */
export const TIME_ZONE_MESSAGE = 'must be a valid IANA timezone (e.g. Europe/Berlin)';
