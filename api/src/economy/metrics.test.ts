import { describe, expect, it } from 'vitest';
import { driftRatio, faucetSink, isDrifting, type LedgerEntry } from './metrics.js';

describe('faucetSink', () => {
  it('splits created vs destroyed and nets them', () => {
    const rows: LedgerEntry[] = [
      { amount: 100, reason: 'daily_reward' },
      { amount: 50, reason: 'quest_reward' },
      { amount: -30, reason: 'shop_purchase' },
      { amount: -20, reason: 'shop_purchase' },
    ];
    expect(faucetSink(rows)).toEqual({ faucet: 150, sink: 50, net: 100 });
  });

  it('excludes admin/migration/backfill reasons from inflation stats', () => {
    const rows: LedgerEntry[] = [
      { amount: 100, reason: 'daily_reward' },
      { amount: 10_000, reason: 'admin_adjustment' },
      { amount: -5_000, reason: 'migration' },
      { amount: 500, reason: 'backfill' },
    ];
    expect(faucetSink(rows)).toEqual({ faucet: 100, sink: 0, net: 100 });
  });
});

describe('driftRatio', () => {
  it('is faucet over sink', () => {
    expect(driftRatio(150, 100)).toBeCloseTo(1.5, 5);
  });
  it('handles an empty sink', () => {
    expect(driftRatio(100, 0)).toBe(Infinity);
    expect(driftRatio(0, 0)).toBe(1);
  });
});

describe('isDrifting', () => {
  it('is within tolerance near the target', () => {
    expect(isDrifting(1.1, 1, 0.2)).toBe(false);
    expect(isDrifting(0.85, 1, 0.2)).toBe(false);
  });
  it('alerts past the tolerance', () => {
    expect(isDrifting(1.3, 1, 0.2)).toBe(true);
    expect(isDrifting(0.7, 1, 0.2)).toBe(true);
  });
  it('always alerts on runaway (infinite) inflation', () => {
    expect(isDrifting(Infinity, 1)).toBe(true);
  });
});
