import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTIONS, FAILED_JOB_RETENTION, jobRetryOptions } from './queue.js';
import { SEND_EMAIL_RETRY, sendEmailJob } from './email.js';

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

describe('how a job is tried again', () => {
  it('follows the queue’s default unless the job or the enqueue says otherwise', () => {
    expect(jobRetryOptions({})).toEqual({});
    expect(jobRetryOptions({ retry: { attempts: 8, backoffDelayMs: 2_000 } })).toEqual({ attempts: 8, backoff: { type: 'exponential', delay: 2_000 } });
    // one enqueue may still ask for its own
    expect(jobRetryOptions({ retry: { attempts: 8, backoffDelayMs: 2_000 } }, { attempts: 2, backoffDelayMs: 500 })).toEqual({ attempts: 2, backoff: { type: 'exponential', delay: 500 } });
    expect(jobRetryOptions({}, { attempts: 3 })).toEqual({ attempts: 3 });
  });

  it('keeps trying an email for minutes, not seconds, so a code is not lost to a busy moment', () => {
    expect(sendEmailJob.retry).toBe(SEND_EMAIL_RETRY);
    const waits = Array.from({ length: SEND_EMAIL_RETRY.attempts - 1 }, (_, i) => SEND_EMAIL_RETRY.backoffDelayMs * 2 ** i);
    const patience = waits.reduce((a, b) => a + b, 0);
    const queueDefault = Array.from({ length: DEFAULT_JOB_OPTIONS.attempts - 1 }, (_, i) => DEFAULT_JOB_OPTIONS.backoff.delay * 2 ** i).reduce((a, b) => a + b, 0);
    expect(patience).toBeGreaterThanOrEqual(4 * 60_000);
    expect(patience).toBeGreaterThan(queueDefault * 10);
    // and not for so long that a code arrives after the fifteen minutes it works for
    expect(patience).toBeLessThan(10 * 60_000);
  });
});
