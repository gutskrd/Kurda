/** Config-driven events (KUR-089) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { EventService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('events (integration)', () => {
  let pool: pg.Pool;
  let svc: EventService;
  const suffix = Date.now().toString(36);
  const key = (s: string) => `it-${s}-${suffix}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // no cache: exercises the DB path on every call
    svc = new EventService(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE key LIKE $1`, [`it-%-${suffix}`]);
    await pool.end();
  });

  it('upsert is idempotent by key and persists window + jsonb payloads', async () => {
    const input = {
      key: key('newroz'),
      name: 'Newroz',
      type: 'holiday',
      startsAt: '2026-03-21T00:00:00.000Z',
      endsAt: '2026-03-22T00:00:00.000Z',
      priority: 5,
      theme: 'newroz',
      quests: [{ id: 'q1' }],
      rewards: { gems: 100 },
    };
    const first = await svc.upsert(input);
    expect(first.priority).toBe(5);
    expect(first.quests).toEqual([{ id: 'q1' }]);
    expect(first.rewards).toEqual({ gems: 100 });

    // same key updates in place (no duplicate row)
    const second = await svc.upsert({ ...input, name: 'Newroz 2026', priority: 8 });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Newroz 2026');
    expect(second.priority).toBe(8);
  });

  it('active returns only in-window enabled events, priority-ordered', async () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    await svc.upsert({
      key: key('live-lo'),
      name: 'Live low',
      type: 'sale',
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-07-01T00:00:00.000Z',
      priority: 1,
    });
    await svc.upsert({
      key: key('live-hi'),
      name: 'Live high',
      type: 'sale',
      startsAt: '2026-06-10T00:00:00.000Z',
      endsAt: '2026-06-20T00:00:00.000Z',
      priority: 9,
    });
    await svc.upsert({
      key: key('past'),
      name: 'Past',
      type: 'sale',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-02T00:00:00.000Z',
      priority: 99,
    });

    const live = (await svc.active(now)).filter((e) => e.key.endsWith(suffix));
    const keys = live.map((e) => e.key);
    expect(keys).toContain(key('live-hi'));
    expect(keys).toContain(key('live-lo'));
    expect(keys).not.toContain(key('past'));
    // higher priority first
    expect(keys.indexOf(key('live-hi'))).toBeLessThan(keys.indexOf(key('live-lo')));
  });

  it('the kill switch removes an event from the active set', async () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const k = key('toggle');
    await svc.upsert({
      key: k,
      name: 'Toggle',
      type: 'sale',
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-07-01T00:00:00.000Z',
    });
    expect((await svc.active(now)).map((e) => e.key)).toContain(k);

    expect(await svc.setEnabled(k, false)).toBe(true);
    expect((await svc.active(now)).map((e) => e.key)).not.toContain(k);
    expect(await svc.setEnabled('no-such-key', false)).toBe(false);
  });
});
