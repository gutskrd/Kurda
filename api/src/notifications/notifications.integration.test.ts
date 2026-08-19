/** Notification preferences + delivery-time gating (KUR-095) against Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { NotificationPrefsService } from './prefs-service.js';
import { DeviceTokenService } from '../push/tokens-service.js';
import { PushService } from '../push/service.js';
import { StubPushProvider } from '../push/provider.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('notification preferences (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let prefs: NotificationPrefsService;
  const suffix = Date.now().toString(36);
  let userId = '';

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    prefs = new NotificationPrefsService(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `notif_${suffix}@it.kurda.app`,
        username: `notif_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.95.0.1',
    });
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('defaults: marketing off, everything else on, no quiet hours', async () => {
    const p = await prefs.get(userId);
    expect(p.marketing).toBe(false);
    expect(p.streak).toBe(true);
    expect(p.quietStartMin).toBeNull();
  });

  it('update persists toggles + quiet hours', async () => {
    await prefs.update(userId, { games: false, quietStartMin: 22 * 60, quietEndMin: 7 * 60 });
    const p = await prefs.get(userId);
    expect(p.games).toBe(false);
    expect(p.streak).toBe(true); // untouched
    expect(p.quietStartMin).toBe(22 * 60);
  });

  it('allows() gates on category and quiet hours (user tz = UTC)', async () => {
    // quiet window 22:00–07:00 UTC
    expect(await prefs.allows(userId, 'streak', new Date('2026-03-21T03:00:00Z'))).toBe(false); // quiet
    expect(await prefs.allows(userId, 'streak', new Date('2026-03-21T12:00:00Z'))).toBe(true);
    expect(await prefs.allows(userId, 'games', new Date('2026-03-21T12:00:00Z'))).toBe(false); // disabled
  });

  it('PushService suppresses a disabled category at delivery time', async () => {
    const tokens = new DeviceTokenService(pool);
    await tokens.register(userId, 'android', `notif-tok-${suffix}`);
    const push = new PushService(tokens, new StubPushProvider(), prefs);
    const report = await push.deliver(userId, { category: 'games', title: 't', body: 'b' });
    expect(report.suppressed).toBe(true);
    expect(report.sent).toBe(0);
  });
});
