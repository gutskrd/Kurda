import { describe, expect, it } from 'vitest';
import { classForJob, DEFAULT_BACKPRESSURE, priorityForJob, shouldShed } from './backpressure.js';

describe('job classes + priority', () => {
  it('classifies jobs, defaulting unknown to standard', () => {
    expect(classForJob('send-email')).toBe('critical');
    expect(classForJob('push-send')).toBe('standard');
    expect(classForJob('analytics-rollup')).toBe('bulk');
    expect(classForJob('mystery-job')).toBe('standard');
  });

  it('orders priority critical < standard < bulk (lower = more urgent)', () => {
    expect(priorityForJob('send-email')).toBeLessThan(priorityForJob('push-send'));
    expect(priorityForJob('push-send')).toBeLessThan(priorityForJob('analytics-rollup'));
  });
});

describe('shouldShed', () => {
  const { shedBulkAbove, shedStandardAbove } = DEFAULT_BACKPRESSURE;

  it('never sheds critical jobs, at any depth', () => {
    expect(shouldShed('send-email', shedStandardAbove + 1_000_000)).toBe(false);
  });

  it('sheds bulk first, once its threshold is exceeded', () => {
    expect(shouldShed('analytics-rollup', shedBulkAbove)).toBe(false);
    expect(shouldShed('analytics-rollup', shedBulkAbove + 1)).toBe(true);
  });

  it('sheds standard only under a much deeper backlog', () => {
    // depth that already sheds bulk must NOT yet shed standard
    expect(shouldShed('push-send', shedBulkAbove + 1)).toBe(false);
    expect(shouldShed('push-send', shedStandardAbove + 1)).toBe(true);
  });
});
