/**
 * The admin's event routes over HTTP: an edit keeps the quests and rewards it
 * did not send, rewards only change through Approvals, and a missing event is
 * answered in the usual error envelope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { EventService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin events (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let events: EventService;
  const suffix = Date.now().toString(36);
  const key = (s: string) => `adm-${s}-${suffix}`;
  let token = '';
  let userId = '';

  const post = (url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, payload, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.82.0.9' });

  const window = { startsAt: '2027-03-21T00:00:00.000Z', endsAt: '2027-03-28T00:00:00.000Z' };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    events = new EventService(pool);
    const r = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `evadm_${suffix}@it.kurda.app`,
        username: `evadm_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.82.0.1',
    });
    await activate(app, pool, r);
    userId = r.json().user.id;
    token = r.json().tokens.accessToken;
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [userId]);
    await pass2fa(app, token);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE key LIKE $1`, [`adm-%-${suffix}`]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('keeps the quests and rewards an edit did not send', async () => {
    await events.upsert({
      key: key('newroz'),
      name: 'Newroz',
      type: 'holiday',
      ...window,
      quests: [{ id: 'q1', kind: 'lessons', target: 3 }],
      rewards: { gems: 100 },
    });
    const res = await post('/admin/events', { key: key('newroz'), name: 'Newroz 2027', type: 'holiday', ...window, priority: 4 });
    expect(res.statusCode).toBe(201);
    const stored = (await events.byKey(key('newroz')))!;
    expect(stored.name).toBe('Newroz 2027');
    expect(stored.quests).toEqual([{ id: 'q1', kind: 'lessons', target: 3 }]);
    expect(stored.rewards).toEqual({ gems: 100 });

    // sending the same rewards back (in any key order) is not a change
    const same = await post('/admin/events', { key: key('newroz'), name: 'Newroz', type: 'holiday', ...window, rewards: { gems: 100 } });
    expect(same.statusCode).toBe(201);
  });

  it('changes rewards only through Approvals, where a second admin signs off', async () => {
    const raised = await post('/admin/events', { key: key('newroz'), name: 'Newroz', type: 'holiday', ...window, rewards: { gems: 5000 } });
    expect(raised.statusCode).toBe(409);
    expect(raised.json().code).toBe('REWARDS_NEED_APPROVAL');
    expect((await events.byKey(key('newroz')))!.rewards).toEqual({ gems: 100 });

    // nor can a new event start out granting anything
    const fresh = await post('/admin/events', { key: key('fresh'), name: 'Fresh', type: 'seasonal', ...window, rewards: { zer: 10 } });
    expect(fresh.statusCode).toBe(409);
    expect(await events.byKey(key('fresh'))).toBeNull();

    // without rewards it is created, giving nothing
    const plain = await post('/admin/events', { key: key('fresh'), name: 'Fresh', type: 'seasonal', ...window });
    expect(plain.statusCode).toBe(201);
    expect(plain.json().event).toMatchObject({ rewards: {}, quests: [] });
  });

  it('answers a missing event in the usual error envelope', async () => {
    const res = await post(`/admin/events/${key('nope')}/enabled`, { enabled: false });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND', message: 'no such event' });
  });
});
