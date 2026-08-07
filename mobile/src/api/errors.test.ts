import { describe, expect, it } from 'vitest';
import type { ApiError } from './types';
import { describeError, formatDuration } from './errors';

const err = (e: Partial<ApiError> & Pick<ApiError, 'kind'>): ApiError => ({ message: 'raw technical detail', ...e });

describe('formatDuration', () => {
  it('formats sub-minute waits in seconds', () => {
    expect(formatDuration(1)).toBe('1 second');
    expect(formatDuration(45)).toBe('45 seconds');
    expect(formatDuration(59)).toBe('59 seconds');
  });
  it('formats minute-scale waits in minutes', () => {
    expect(formatDuration(60)).toBe('1 minute');
    expect(formatDuration(150)).toBe('3 minutes'); // rounds
  });
  it('never shows zero/negative', () => {
    expect(formatDuration(0)).toBe('1 second');
    expect(formatDuration(-5)).toBe('1 second');
  });
});

describe('describeError', () => {
  it('rewrites a network error as an offline, retryable message', () => {
    const d = describeError(err({ kind: 'network' }));
    expect(d.offline).toBe(true);
    expect(d.retryable).toBe(true);
    expect(d.message).not.toContain('raw technical detail');
    expect(d.message.toLowerCase()).toContain('offline');
  });

  it('rewrites a 5xx as a retryable, non-offline "our end" message', () => {
    const d = describeError(err({ kind: 'server', status: 500 }));
    expect(d).toMatchObject({ retryable: true, offline: false });
    expect(d.message).not.toContain('raw technical detail');
  });

  it('includes the retry-after hint for rate limits', () => {
    expect(describeError(err({ kind: 'rate_limited', retryAfterSec: 60 })).message).toContain('1 minute');
    expect(describeError(err({ kind: 'rate_limited', retryAfterSec: 30 })).message).toContain('30 seconds');
    expect(describeError(err({ kind: 'rate_limited' })).retryable).toBe(true);
  });

  it('passes the server message through for client errors (not retryable)', () => {
    const d = describeError(err({ kind: 'client', status: 422, message: 'title and body are required' }));
    expect(d).toEqual({ message: 'title and body are required', retryable: false, offline: false });
  });

  it('passes the server message through for unauthorized (so a bad login is not "session expired")', () => {
    const d = describeError(err({ kind: 'unauthorized', status: 401, message: 'incorrect email or password' }));
    expect(d.message).toBe('incorrect email or password');
    expect(d.retryable).toBe(false);
  });

  it('falls back to a generic message when the server sends none', () => {
    expect(describeError({ kind: 'client', message: '' }).message).toBeTruthy();
  });
});
