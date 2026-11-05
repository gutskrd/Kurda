import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_BODY_MAX, CLIENT_ERROR_LIMITS, CLIENT_ERROR_STACK_LINES, scrubClientErrorStack, scrubClientErrorText } from './client-errors.js';

describe('cleaning the text of a crash report', () => {
  it('takes out email addresses, and leaves the words round them', () => {
    expect(scrubClientErrorText('No account for rojda.k+test@example.co.uk, try again', 300)).toBe('No account for [email], try again');
    expect(scrubClientErrorText('Sent to a@b.com.', 300)).toBe('Sent to [email].');
  });

  it('leaves a stack frame alone even though it looks like an address', () => {
    expect(scrubClientErrorText('render@main.jsbundle:1:2345', 300)).toBe('render@main.jsbundle:1:2345');
  });

  it('takes out tokens, ids and the query of a link', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';
    expect(scrubClientErrorText(`refresh failed for ${jwt}`, 300)).toBe('refresh failed for [token]');
    expect(scrubClientErrorText('Authorization: Bearer abc.def-123==', 300)).toBe('Authorization: Bearer [token]');
    expect(scrubClientErrorText('post 3f2a9c1e-8b7d-4e6f-a1b2-c3d4e5f60718 is gone', 300)).toBe('post [id] is gone');
    expect(scrubClientErrorText('GET https://kurda-api.onrender.com/auth/verify?code=123456&u=7 failed', 300)).toBe(
      'GET https://kurda-api.onrender.com/auth/verify failed',
    );
    expect(scrubClientErrorText('opened hevalo://reset#token=abc', 300)).toBe('opened hevalo://reset');
  });

  it('drops control characters but keeps tabs and line breaks', () => {
    expect(scrubClientErrorText('a\u0000b\u0007c\td\ne', 300)).toBe('abc\td\ne');
  });

  it('keeps no more than it is allowed, without splitting a character in two', () => {
    expect(scrubClientErrorText('x'.repeat(5000), 300)).toHaveLength(300);
    expect(scrubClientErrorText(`${'x'.repeat(299)}😀`, 300)).toBe('x'.repeat(299));
  });

  it('changes nothing the second time, so the server can clean it again', () => {
    const once = scrubClientErrorText('mail rojda@example.com about 3f2a9c1e-8b7d-4e6f-a1b2-c3d4e5f60718 at https://hevalo.app/a?b=c', 300);
    expect(scrubClientErrorText(once, 300)).toBe(once);
  });
});

describe('cleaning a stack', () => {
  it('keeps the top frames, trimmed, without blank lines', () => {
    const frames = Array.from({ length: 50 }, (_, i) => `    at frame${i} (address at index.android.bundle:1:${1000 + i})`);
    const stack = scrubClientErrorStack(['TypeError: x is undefined', '', ...frames].join('\n'), 5000);
    const lines = stack.split('\n');
    expect(lines).toHaveLength(CLIENT_ERROR_STACK_LINES);
    expect(lines[0]).toBe('TypeError: x is undefined');
    expect(lines[1]).toBe('at frame0 (address at index.android.bundle:1:1000)');
  });

  it('is cut to its limit after the frames are chosen', () => {
    const stack = scrubClientErrorStack(Array.from({ length: 20 }, () => 'y'.repeat(200)).join('\n'), CLIENT_ERROR_LIMITS.stack);
    expect(stack.length).toBe(CLIENT_ERROR_LIMITS.stack);
  });
});

describe('the limits', () => {
  it('let a full batch at every limit through the body limit, with room for escaping', () => {
    const L = CLIENT_ERROR_LIMITS;
    const perReport = L.name + L.message + L.stack + L.componentStack + L.screen + 100;
    expect(L.reports * perReport * 1.2 + L.appVersion + L.buildNumber + L.osVersion).toBeLessThan(CLIENT_ERROR_BODY_MAX);
  });
});
