/** Optional phone (SMS) verification vs real Postgres (CI job). KUR-297. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PhoneVerificationService } from './phone-verification-service.js';
import { StubSmsSender } from './sms.js';
import { RESEND_COOLDOWN_MS } from './phone-verification.js';
import { TrustService } from '../trust/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('phone verification (integration)', () => {
  let pool: pg.Pool;
  let sms: StubSmsSender;
  let clock: number;
  let svc: PhoneVerificationService;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;

  async function makeUser(opts: { verified?: boolean; ageMs?: number } = {}): Promise<string> {
    const n = userIds.length;
    const created = new Date(Date.now() - (opts.ageMs ?? 0));
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, created_at, email_verified_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`phone_${n}_${suffix}@it.kurda.app`, `phone_${n}_${suffix}`, created, opts.verified ? created : null],
    );
    const id = res.rows[0]!.id;
    userIds.push(id);
    return id;
  }

  const codeFor = (e164: string): string => {
    const msg = sms.lastTo(e164)?.message ?? '';
    return /(\d{6})/.exec(msg)?.[1] ?? '';
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });
  beforeEach(() => {
    sms = new StubSmsSender();
    clock = Date.UTC(2026, 7, 1, 12, 0, 0);
    svc = new PhoneVerificationService(pool, { sms, now: () => clock });
  });
  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
  });

  it('sends a code and verifies it, marking the account verified (masked)', async () => {
    const u = await makeUser();
    const phone = '+14155550111';
    const sent = await svc.send(u, phone);
    expect(sent.ok).toBe(true);
    if (sent.ok) expect(sent.masked).toMatch(/^\+.*•.*\d$/);

    const before = await svc.status(u);
    expect(before.verified).toBe(false);

    const res = await svc.verify(u, phone, codeFor(phone));
    expect(res.ok).toBe(true);

    const after = await svc.status(u);
    expect(after.verified).toBe(true);
    expect(after.masked).not.toContain('4155'); // middle masked

    // in-flight session cleared on success
    const pending = await pool.query(`SELECT 1 FROM phone_verifications WHERE user_id = $1`, [u]);
    expect(pending.rowCount).toBe(0);
  });

  it('rejects an invalid number and a wrong code (attempts decrement)', async () => {
    const u = await makeUser();
    const bad = await svc.send(u, 'not-a-number');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('invalid-number');

    const phone = '+14155550222';
    await svc.send(u, phone);
    const wrong = await svc.verify(u, phone, '000000');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.reason).toBe('mismatch');
      expect(wrong.remaining).toBe(4);
    }
  });

  it('enforces resend cooldown then allows a resend after it elapses', async () => {
    const u = await makeUser();
    const phone = '+14155550333';
    expect((await svc.send(u, phone)).ok).toBe(true);

    clock += 30_000; // within the 60s cooldown
    const tooSoon = await svc.send(u, phone);
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.reason).toBe('cooldown');

    clock += RESEND_COOLDOWN_MS; // past the cooldown
    const resent = await svc.send(u, phone);
    expect(resent.ok).toBe(true);
    if (resent.ok) expect(resent.resent).toBe(true);
  });

  it('a number verifies one account at a time — recycling detaches the prior holder', async () => {
    const phone = '+14155550444';
    const a = await makeUser();
    await svc.send(a, phone);
    await svc.verify(a, phone, codeFor(phone));
    expect((await svc.status(a)).verified).toBe(true);

    // a real user reclaims a recycled number: verifying it detaches account A
    const b = await makeUser();
    await svc.send(b, phone);
    const ok = await svc.verify(b, phone, codeFor(phone));
    expect(ok.ok).toBe(true);

    expect((await svc.status(b)).verified).toBe(true);
    expect((await svc.status(a)).verified).toBe(false); // detached — exclusivity
  });

  it('a verified phone fast-tracks the trust level (#295)', async () => {
    const trust = new TrustService(pool);
    // 1-day-old, email-verified account: normally `basic` (needs 7d for established)
    const u = await makeUser({ verified: true, ageMs: DAY + 60_000 });
    expect(await trust.getLevel(u)).toBe('basic');

    const phone = '+14155550555';
    await svc.send(u, phone);
    await svc.verify(u, phone, codeFor(phone));
    // phone verify fast-tracks to `established` at >= 1 day
    expect(await trust.getLevel(u)).toBe('established');
  });

  it('is removable and excluded after removal', async () => {
    const u = await makeUser();
    const phone = '+14155550666';
    await svc.send(u, phone);
    await svc.verify(u, phone, codeFor(phone));
    expect((await svc.status(u)).verified).toBe(true);

    await svc.remove(u);
    expect((await svc.status(u)).verified).toBe(false);
    expect((await svc.status(u)).masked).toBeNull();
  });
});
