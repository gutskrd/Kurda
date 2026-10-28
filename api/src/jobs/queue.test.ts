import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTIONS, FAILED_JOB_RETENTION } from './queue.js';

describe('job retention', () => {
  it('keeps failed jobs for a while, not for ever, so the queue cannot only grow', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(FAILED_JOB_RETENTION);
    expect(FAILED_JOB_RETENTION.count).toBeGreaterThan(0);
    expect(FAILED_JOB_RETENTION.age).toBeGreaterThan(0);
  });

  it('keeps them for longer than the email page reads back, and at least as many as it reads', () => {
    // email/admin-routes.ts: the newest 500 failed jobs, over the last week
    expect(FAILED_JOB_RETENTION.age).toBeGreaterThanOrEqual(7 * 24 * 3600);
    expect(FAILED_JOB_RETENTION.count).toBeGreaterThanOrEqual(500);
  });

  it('still lets completed jobs go after a day', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ age: 24 * 3600, count: 1_000 });
  });
});
