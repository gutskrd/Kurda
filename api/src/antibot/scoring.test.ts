import { describe, expect, it } from 'vitest';
import { CHALLENGE_THRESHOLD, deviceSignal, FLAG_THRESHOLD, SIGNAL_WEIGHTS, scoreAccount, type BotSignals } from './scoring.js';

const clean: BotSignals = { pacingAnomaly: 0, uptimeAnomaly: 0, timingUniformity: 0, deviceAccountCount: 1 };

describe('deviceSignal', () => {
  it('is zero for ordinary sharing and grows past the grace count', () => {
    expect(deviceSignal(1)).toBe(0);
    expect(deviceSignal(3)).toBe(0); // grace
    expect(deviceSignal(30)).toBe(1); // saturated
    expect(deviceSignal(7)).toBeGreaterThan(0);
    expect(deviceSignal(7)).toBeLessThan(1);
  });
});

describe('scoreAccount', () => {
  it('clears a normal human account', () => {
    const r = scoreAccount(clean);
    expect(r.tier).toBe('clear');
    expect(r.challenge).toBe(false);
    expect(r.flagged).toBe(false);
  });

  it('flags a clear bot (fast pacing + 24/7 + scripted timing)', () => {
    const r = scoreAccount({ pacingAnomaly: 1, uptimeAnomaly: 1, timingUniformity: 1, deviceAccountCount: 1 });
    expect(r.score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);
    expect(r.flagged).toBe(true);
  });

  it('challenges a borderline account without flagging it', () => {
    // pacing + timing at ~0.7 each → between challenge and flag thresholds
    const r = scoreAccount({ pacingAnomaly: 0.7, uptimeAnomaly: 0, timingUniformity: 0.7, deviceAccountCount: 1 });
    expect(r.score).toBeGreaterThanOrEqual(CHALLENGE_THRESHOLD);
    expect(r.score).toBeLessThan(FLAG_THRESHOLD);
    expect(r.tier).toBe('challenge');
  });

  it('NEVER flags on the device signal alone — shared classroom device (edge case)', () => {
    const r = scoreAccount({ pacingAnomaly: 0, uptimeAnomaly: 0, timingUniformity: 0, deviceAccountCount: 40 });
    expect(r.score).toBeLessThan(CHALLENGE_THRESHOLD); // device weight < challenge threshold
    expect(r.flagged).toBe(false);
    expect(r.challenge).toBe(false);
    // by construction: the device weight can't reach the challenge threshold
    expect(SIGNAL_WEIGHTS.device).toBeLessThan(CHALLENGE_THRESHOLD);
  });

  it('device signal only tips an already-borderline account', () => {
    const base = { pacingAnomaly: 0.5, uptimeAnomaly: 0.4, timingUniformity: 0.4, deviceAccountCount: 1 } as const;
    const withDevice = scoreAccount({ ...base, deviceAccountCount: 40 });
    expect(withDevice.score).toBeGreaterThan(scoreAccount(base).score);
  });
});
