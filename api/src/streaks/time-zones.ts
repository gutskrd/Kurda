import type pg from 'pg';
import { safeTimeZone } from './streak-logic.js';

/**
 * Which time zones an account may be given: one the app's own date code can
 * use (Intl, `safeTimeZone`) and the database can too.
 *
 * Intl alone is not enough. It takes names Postgres has never heard of — old
 * abbreviations such as `BET` or `AET`, `SystemV/…` names, a bare `+0530`,
 * links the zone database has since dropped — and a stored one of those made
 * every query that reads the day in the account's zone fail, the hourly streak
 * reminders for everyone among them. Postgres's list is also not the same
 * everywhere: it is whatever zone files the server was built with, so the
 * list is read from the database itself rather than written down here.
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
