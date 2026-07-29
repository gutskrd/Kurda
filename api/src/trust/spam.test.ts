import { describe, expect, it } from 'vitest';
import {
  BURST_SUSPEND,
  BURST_THROTTLE,
  countNearIdentical,
  evaluateSpam,
  mostSevere,
  normalizeContent,
  REPEAT_MUTE,
  REPEAT_SUSPEND,
  REPEAT_THROTTLE,
} from './spam.js';

describe('normalizeContent', () => {
  it('lowercases, NFC-normalizes, and collapses whitespace', () => {
    expect(normalizeContent('  Buy   NOW!! ')).toBe('buy now!!');
  });
});

describe('countNearIdentical', () => {
  it('counts equal-after-normalization messages, including the candidate', () => {
    const recent = ['buy now', 'BUY  now', 'hello', 'buy now!'];
    // 'buy now' matches 'buy now' and 'BUY  now' (normalized) → 2 + the candidate = 3
    expect(countNearIdentical(recent, 'buy now')).toBe(3);
  });

  it('is 1 when nothing matches (just the candidate)', () => {
    expect(countNearIdentical(['a', 'b'], 'c')).toBe(1);
  });
});

describe('mostSevere', () => {
  it('picks the higher-severity action', () => {
    expect(mostSevere('allow', 'throttle')).toBe('throttle');
    expect(mostSevere('suspend', 'mute')).toBe('suspend');
    expect(mostSevere('mute', 'mute')).toBe('mute');
  });
});

describe('evaluateSpam — repetition escalation', () => {
  const burst = (repeatCount: number) => evaluateSpam({ repeatCount, burstCount: 0 });

  it('allows below the throttle threshold', () => {
    expect(burst(REPEAT_THROTTLE - 1).action).toBe('allow');
  });

  it('throttles → mutes → suspends as repeats climb', () => {
    expect(burst(REPEAT_THROTTLE).action).toBe('throttle');
    expect(burst(REPEAT_MUTE).action).toBe('mute');
    expect(burst(REPEAT_SUSPEND).action).toBe('suspend');
  });

  it('queues for review at mute or worse, not for a throttle', () => {
    expect(burst(REPEAT_THROTTLE).queueForReview).toBe(false);
    expect(burst(REPEAT_MUTE).queueForReview).toBe(true);
    expect(burst(REPEAT_SUSPEND).queueForReview).toBe(true);
  });
});

describe('evaluateSpam — burst escalation', () => {
  it('throttles a fast burst and suspends an extreme one', () => {
    expect(evaluateSpam({ repeatCount: 1, burstCount: BURST_THROTTLE }).action).toBe('throttle');
    expect(evaluateSpam({ repeatCount: 1, burstCount: BURST_SUSPEND }).action).toBe('suspend');
  });
});

describe('evaluateSpam — combined', () => {
  it('takes the most severe of repetition and burst', () => {
    // low repeats (throttle) but extreme burst (suspend) → suspend
    const v = evaluateSpam({ repeatCount: REPEAT_THROTTLE, burstCount: BURST_SUSPEND });
    expect(v.action).toBe('suspend');
    expect(v.queueForReview).toBe(true);
  });

  it('a normal message is allowed and not queued', () => {
    expect(evaluateSpam({ repeatCount: 1, burstCount: 2 })).toEqual({
      action: 'allow',
      queueForReview: false,
    });
  });
});
