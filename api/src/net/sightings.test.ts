import { describe, expect, it } from 'vitest';
import { networkHashOf } from './network-key.js';
import { NetworkSightings } from './sightings.js';

/** A database that records what it was asked to write. */
function fakeDb(fail = false) {
  const writes: Array<{ userId: string; netHash: string; day: string }> = [];
  return {
    writes,
    query: async (_sql: string, params: unknown[]) => {
      if (fail) throw new Error('database down');
      writes.push({ userId: params[0] as string, netHash: params[1] as string, day: params[2] as string });
      return { rows: [], rowCount: 1 };
    },
  };
}

describe('NetworkSightings', () => {
  it('writes an account’s network once a day, whatever the address within it', async () => {
    const db = fakeDb();
    let now = new Date('2026-10-21T08:00:00.000Z');
    const s = new NetworkSightings(db as never, undefined, () => now);
    await s.seen('u1', '203.0.113.7');
    expect(s.seen('u1', '203.0.113.7')).toBeNull();
    await s.seen('u1', '2001:db8:1:2::1');
    expect(s.seen('u1', '2001:db8:1:2::99')).toBeNull(); // the same /64
    await s.seen('u2', '203.0.113.7'); // another account
    now = new Date('2026-10-22T00:00:01.000Z');
    await s.seen('u1', '203.0.113.7'); // a new day
    expect(db.writes).toEqual([
      { userId: 'u1', netHash: networkHashOf('203.0.113.7'), day: '2026-10-21' },
      { userId: 'u1', netHash: networkHashOf('2001:db8:1:2::1'), day: '2026-10-21' },
      { userId: 'u2', netHash: networkHashOf('203.0.113.7'), day: '2026-10-21' },
      { userId: 'u1', netHash: networkHashOf('203.0.113.7'), day: '2026-10-22' },
    ]);
  });

  it('writes nothing for something that is not an address', () => {
    const db = fakeDb();
    expect(new NetworkSightings(db as never).seen('u1', 'unknown')).toBeNull();
    expect(db.writes).toEqual([]);
  });

  it('never throws: a failed write is logged and forgotten', async () => {
    const warned: unknown[] = [];
    const s = new NetworkSightings(fakeDb(true) as never, { warn: (o: unknown) => void warned.push(o) });
    await expect(s.seen('u1', '203.0.113.7')).resolves.toBeUndefined();
    expect(warned).toHaveLength(1);
  });

  it('remembers a bounded number of accounts, forgetting the oldest', async () => {
    const db = fakeDb();
    const s = new NetworkSightings(db as never, undefined, () => new Date('2026-10-21T08:00:00.000Z'), 2);
    await s.seen('a', '203.0.113.1');
    await s.seen('b', '203.0.113.1');
    await s.seen('c', '203.0.113.1'); // 'a' is forgotten
    expect(s.seen('c', '203.0.113.1')).toBeNull();
    await s.seen('a', '203.0.113.1'); // written again: harmless, the row is upserted
    expect(db.writes.map((w) => w.userId)).toEqual(['a', 'b', 'c', 'a']);
  });
});
