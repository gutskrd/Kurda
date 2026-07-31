import { describe, expect, it } from 'vitest';
import { deriveSignals } from './signals.js';
import { scoreAccount } from './scoring.js';

describe('deriveSignals', () => {
  it('reads near-zero for ordinary human play', () => {
    const s = deriveSignals({
      questionsAnswered: 100, impossibleCount: 0, fastCount: 2, rttAnomalyCount: 0,
      distinctActiveHours: 6, deviceAccountCount: 1,
    });
    expect(s.pacingAnomaly).toBe(0);
    expect(s.uptimeAnomaly).toBe(0);
    expect(s.timingUniformity).toBeLessThan(0.05);
    expect(scoreAccount(s).tier).toBe('clear');
  });

  it('lights up for scripted 24/7 play', () => {
    const s = deriveSignals({
      questionsAnswered: 100, impossibleCount: 40, fastCount: 60, rttAnomalyCount: 30,
      distinctActiveHours: 23, deviceAccountCount: 10,
    });
    expect(s.pacingAnomaly).toBe(1);
    expect(s.uptimeAnomaly).toBeGreaterThan(0.8);
    expect(s.timingUniformity).toBeGreaterThan(0.8);
    expect(scoreAccount(s).tier).toBe('flagged');
  });

  it('ignores behavioral signals below the minimum sample (device still counts)', () => {
    const s = deriveSignals({
      questionsAnswered: 5, impossibleCount: 5, fastCount: 5, rttAnomalyCount: 5,
      distinctActiveHours: 4, deviceAccountCount: 8,
    });
    expect(s.pacingAnomaly).toBe(0);
    expect(s.timingUniformity).toBe(0);
    expect(s.deviceAccountCount).toBe(8);
  });

  it('never flags on a shared classroom device alone', () => {
    // 20 accounts on one device, but perfectly human behavior otherwise
    const s = deriveSignals({
      questionsAnswered: 100, impossibleCount: 0, fastCount: 0, rttAnomalyCount: 0,
      distinctActiveHours: 5, deviceAccountCount: 20,
    });
    expect(scoreAccount(s).tier).toBe('clear'); // device weight 0.15 < challenge 0.4
  });
});
