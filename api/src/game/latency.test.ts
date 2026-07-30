import { describe, expect, it } from 'vitest';
import { RTT_ANOMALY_MS, RTT_CAP_MS, compensatedElapsed, isRttAnomalous, rttDistribution } from './latency.js';

describe('compensatedElapsed', () => {
  it('credits back half the RTT', () => {
    expect(compensatedElapsed(1000, 200)).toBe(900); // 1000 - 200/2
  });

  it('caps the compensation so RTT inflation cannot farm the bonus', () => {
    // RTT 10s → capped at RTT_CAP_MS, so only RTT_CAP_MS/2 is credited
    expect(compensatedElapsed(5000, 10_000)).toBe(5000 - RTT_CAP_MS / 2);
  });

  it('never goes below zero', () => {
    expect(compensatedElapsed(50, RTT_CAP_MS)).toBe(0);
  });

  it('is a no-op for zero/negative RTT', () => {
    expect(compensatedElapsed(1000, 0)).toBe(1000);
    expect(compensatedElapsed(1000, -50)).toBe(1000);
  });
});

describe('isRttAnomalous', () => {
  it('flags implausibly high RTT (sandbagging → KUR-058)', () => {
    expect(isRttAnomalous(RTT_ANOMALY_MS + 1)).toBe(true);
    expect(isRttAnomalous(200)).toBe(false);
  });
});

describe('rttDistribution', () => {
  it('summarizes samples', () => {
    const d = rttDistribution([100, 200, 300, 400, 1000]);
    expect(d.min).toBe(100);
    expect(d.max).toBe(1000);
    expect(d.count).toBe(5);
    expect(d.median).toBe(300);
  });

  it('is all-zero for no samples', () => {
    expect(rttDistribution([])).toMatchObject({ min: 0, median: 0, p95: 0, max: 0, count: 0 });
  });
});
