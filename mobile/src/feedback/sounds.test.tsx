// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
import { soundFile } from './sounds';

describe('which chime a moment plays', () => {
  // a run of right answers climbs a step each time, and stays at the top
  it('climbs with a run of right answers, up to the fourth', () => {
    expect([0, 1, 2, 3, 4, 9].map((step) => soundFile('correct', step))).toEqual([
      'correct-1',
      'correct-2',
      'correct-3',
      'correct-4',
      'correct-4',
      'correct-4',
    ]);
  });

  it('has one sound each for a miss, a finished lesson and something earned', () => {
    expect(soundFile('wrong')).toBe('wrong');
    expect(soundFile('complete')).toBe('complete');
    expect(soundFile('reward')).toBe('reward');
  });
});
