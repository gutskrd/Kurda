import { describe, expect, it } from 'vitest';
import {
  canResend,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS,
  remainingAttempts,
  resend,
  RESEND_COOLDOWN_MS,
  startVerification,
  verifyCode,
  type VerificationState,
} from './phone-verification.js';

const T0 = 1_000_000;

describe('startVerification', () => {
  it('opens a session with one send and a fresh expiry', () => {
    expect(startVerification('h1', T0)).toEqual<VerificationState>({
      codeHash: 'h1',
      expiresAt: T0 + CODE_TTL_MS,
      attempts: 0,
      sends: 1,
      lastSentAt: T0,
    });
  });
});

describe('verifyCode', () => {
  const state = startVerification('good', T0);

  it('accepts the correct code within the window', () => {
    const r = verifyCode(state, 'good', T0 + 1000);
    expect(r.ok).toBe(true);
  });

  it('rejects a wrong code and consumes an attempt', () => {
    const r = verifyCode(state, 'bad', T0 + 1000);
    expect(r).toMatchObject({ ok: false, reason: 'mismatch' });
    if (!r.ok) expect(r.state.attempts).toBe(1);
  });

  it('rejects an expired code even when correct', () => {
    const r = verifyCode(state, 'good', T0 + CODE_TTL_MS + 1);
    expect(r).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('locks the code after MAX_ATTEMPTS failures', () => {
    let s = startVerification('good', T0);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const r = verifyCode(s, 'bad', T0 + 1000);
      expect(r.ok).toBe(false);
      s = r.state;
    }
    expect(remainingAttempts(s)).toBe(0);
    // further attempts — even the right code — are refused until a resend
    const locked = verifyCode(s, 'good', T0 + 1000);
    expect(locked).toMatchObject({ ok: false, reason: 'too-many-attempts' });
  });

  it('counts down remaining attempts', () => {
    const after1 = verifyCode(state, 'bad', T0 + 1000);
    if (!after1.ok) expect(remainingAttempts(after1.state)).toBe(MAX_ATTEMPTS - 1);
  });
});

describe('canResend / resend', () => {
  it('blocks a resend during the cooldown and reports retryAfter', () => {
    const s = startVerification('h1', T0);
    const check = canResend(s, T0 + 1000);
    expect(check).toEqual({
      allowed: false,
      reason: 'cooldown',
      retryAfterMs: RESEND_COOLDOWN_MS - 1000,
    });
  });

  it('allows a resend after the cooldown, resetting expiry + attempts', () => {
    let s = startVerification('h1', T0);
    // burn an attempt so we can see it reset
    const failed = verifyCode(s, 'bad', T0 + 1000);
    if (!failed.ok) s = failed.state;
    expect(s.attempts).toBe(1);

    const r = resend(s, 'h2', T0 + RESEND_COOLDOWN_MS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toMatchObject({ codeHash: 'h2', attempts: 0, sends: 2 });
      expect(r.state.expiresAt).toBe(T0 + RESEND_COOLDOWN_MS + CODE_TTL_MS);
    }
  });

  it('enforces the per-session send cap', () => {
    let s = startVerification('h1', T0);
    let t = T0;
    // already sent once; resend up to the cap
    for (let i = 1; i < MAX_SENDS; i++) {
      t += RESEND_COOLDOWN_MS;
      const r = resend(s, `h${i + 1}`, t);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.sends).toBe(MAX_SENDS);
    t += RESEND_COOLDOWN_MS;
    expect(resend(s, 'over', t)).toEqual({ ok: false, reason: 'max-sends' });
  });
});
