import { describe, expect, it } from 'vitest';
import { banState, expiryFrom, isBanned, isMuted, normalizeReason } from './moderation.js';

const now = new Date('2026-07-12T00:00:00.000Z');
const future = new Date('2026-07-13T00:00:00.000Z');
const past = new Date('2026-07-11T00:00:00.000Z');

describe('banState', () => {
  it('classifies active / temp / perm and auto-lapses temp bans', () => {
    expect(banState(now, null, null)).toBe('active');
    expect(banState(now, past, null)).toBe('perm_banned');
    expect(banState(now, past, future)).toBe('temp_banned');
    expect(banState(now, past, past)).toBe('active'); // temp ban expired
    expect(isBanned(now, past, future)).toBe(true);
    expect(isBanned(now, past, past)).toBe(false);
  });
});

describe('isMuted', () => {
  it('is true only while the mute is in the future', () => {
    expect(isMuted(now, future)).toBe(true);
    expect(isMuted(now, past)).toBe(false);
    expect(isMuted(now, null)).toBe(false);
  });
});

describe('normalizeReason', () => {
  it('requires a non-empty, bounded reason', () => {
    expect(normalizeReason('  spamming  ')).toBe('spamming');
    expect(normalizeReason('')).toBeNull();
    expect(normalizeReason('   ')).toBeNull();
    expect(normalizeReason(undefined)).toBeNull();
    expect(normalizeReason('x'.repeat(501))).toBeNull();
  });
});

describe('expiryFrom', () => {
  it('computes a future expiry or rejects bad durations', () => {
    expect(expiryFrom(now, 24)).toEqual(future);
    expect(expiryFrom(now, 0)).toBeNull();
    expect(expiryFrom(now, -3)).toBeNull();
  });
});
