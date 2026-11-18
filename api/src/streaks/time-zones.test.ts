import { describe, expect, it } from 'vitest';
import { databaseTimeZones, storableTimeZone } from './time-zones.js';

/** A database that knows these zones, and counts how often it was asked; `fail` makes the next read fail. */
function database(names: string[]) {
  const db = {
    asked: 0,
    fail: false,
    async query() {
      db.asked++;
      if (db.fail) {
        db.fail = false;
        throw new Error('connection lost');
      }
      return { rows: names.map((name) => ({ name })) };
    },
  };
  return db;
}

describe('storableTimeZone', () => {
  it('takes a zone both the date code and the database know, and nothing else', async () => {
    const db = database(['UTC', 'Europe/Berlin', 'Asia/Baghdad']);
    expect(await storableTimeZone(db as never, 'Europe/Berlin')).toBe('Europe/Berlin');
    expect(await storableTimeZone(db as never, 'UTC')).toBe('UTC');
    // the date code takes this one; this database does not know it
    expect(await storableTimeZone(db as never, 'BET')).toBeNull();
    // and neither knows this one
    expect(await storableTimeZone(db as never, 'Mars/OlympusMons')).toBeNull();
    expect(await storableTimeZone(db as never, '')).toBeNull();
  });

  it('reads the database’s list once, and asks again after a read that failed', async () => {
    const db = database(['UTC']);
    db.fail = true;
    await expect(databaseTimeZones(db as never)).rejects.toThrow('connection lost');
    expect(await storableTimeZone(db as never, 'UTC')).toBe('UTC');
    expect(await storableTimeZone(db as never, 'UTC')).toBe('UTC');
    expect(db.asked).toBe(2);
  });
});
