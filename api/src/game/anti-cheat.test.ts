import { describe, expect, it } from 'vitest';
import { MIN_QUESTIONS_FOR_ACCURACY, MIN_SAMPLE, evaluate, type PlayerStats } from './anti-cheat.js';

const base: PlayerStats = {
  questionsAnswered: 0,
  correctCount: 0,
  fastCount: 0,
  impossibleCount: 0,
  rttAnomalyCount: 0,
};

describe('evaluate — clean play', () => {
  it('flags nothing for a normal record', () => {
    const v = evaluate({ ...base, questionsAnswered: 40, correctCount: 30, fastCount: 5 });
    expect(v.flags).toHaveLength(0);
    expect(v.shadow).toBe(false);
  });

  it('does not flag perfect accuracy below the sample threshold (fast experts)', () => {
    const n = MIN_QUESTIONS_FOR_ACCURACY - 1;
    const v = evaluate({ ...base, questionsAnswered: n, correctCount: n });
    expect(v.flags.find((f) => f.type === 'PERFECT_ACCURACY')).toBeUndefined();
  });
});

describe('evaluate — flags', () => {
  it('flags 100% accuracy over the large-sample threshold', () => {
    const n = MIN_QUESTIONS_FOR_ACCURACY;
    const v = evaluate({ ...base, questionsAnswered: n, correctCount: n });
    expect(v.flags.map((f) => f.type)).toContain('PERFECT_ACCURACY');
  });

  it('flags consistently-fast answers', () => {
    const n = MIN_SAMPLE;
    const v = evaluate({ ...base, questionsAnswered: n, correctCount: n / 2, fastCount: n });
    expect(v.flags.map((f) => f.type)).toContain('CONSISTENTLY_FAST');
  });

  it('flags impossible timing at high confidence', () => {
    const v = evaluate({ ...base, questionsAnswered: 20, correctCount: 10, impossibleCount: 8 });
    const flag = v.flags.find((f) => f.type === 'IMPOSSIBLE_TIMING');
    expect(flag?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(v.shadow).toBe(true); // strong single signal
  });

  it('flags repeated RTT anomalies (from KUR-057)', () => {
    const v = evaluate({ ...base, questionsAnswered: 30, correctCount: 15, rttAnomalyCount: 4 });
    expect(v.flags.map((f) => f.type)).toContain('RTT_ANOMALY');
  });

  it('shadow-flags when two independent signals coincide', () => {
    const n = MIN_QUESTIONS_FOR_ACCURACY;
    const v = evaluate({ ...base, questionsAnswered: n, correctCount: n, fastCount: n });
    expect(v.flags.length).toBeGreaterThanOrEqual(2);
    expect(v.shadow).toBe(true);
  });
});
