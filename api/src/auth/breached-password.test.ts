import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BREACH_RANGE_URL, breachCheckEnabled, isBreachedPassword } from './breached-password.js';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();

/** A stand-in for the range API that records what it was asked. */
function corpus(lines: (prefix: string) => string[], status = 200) {
  const asked: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    asked.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(lines(url.slice(BREACH_RANGE_URL.length)).join('\r\n'), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked };
}

describe('isBreachedPassword', () => {
  const leaked = 'P@ssw0rd-from-a-dump';
  const hash = sha1(leaked);

  it('finds a breached password, sending only the first five characters of its hash, padded', async () => {
    const { fetch, asked } = corpus(() => [`${hash.slice(5)}:1234`, `${'A'.repeat(35)}:0`]);
    expect(await isBreachedPassword(leaked, { fetch })).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe(`${BREACH_RANGE_URL}${hash.slice(0, 5)}`);
    expect(asked[0]!.url).not.toContain(hash.slice(5));
    expect(asked[0]!.headers['Add-Padding']).toBe('true');
  });

  it('passes a password the corpus does not hold, and ignores the padding decoys', async () => {
    expect(await isBreachedPassword('a-strong-password1', corpus(() => [`${'B'.repeat(35)}:7`]))).toBe(false);
    // a decoy that happens to carry the suffix has a count of 0
    expect(await isBreachedPassword(leaked, corpus(() => [`${hash.slice(5)}:0`]))).toBe(false);
  });

  it('fails open: an error, a refusal or a timeout never blocks a password', async () => {
    const throws = (async () => {
      throw new Error('unreachable');
    }) as unknown as typeof fetch;
    expect(await isBreachedPassword(leaked, { fetch: throws })).toBe(false);
    expect(await isBreachedPassword(leaked, corpus(() => [`${hash.slice(5)}:9`], 503))).toBe(false);
    const hangs = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const started = Date.now();
    expect(await isBreachedPassword(leaked, { fetch: hangs, timeoutMs: 50 })).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('breachCheckEnabled', () => {
  it('is on by default except under test, and the flag decides when set', () => {
    expect(breachCheckEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(breachCheckEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(breachCheckEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(breachCheckEnabled({ NODE_ENV: 'production', PASSWORD_BREACH_CHECK: 'false' })).toBe(false);
    expect(breachCheckEnabled({ NODE_ENV: 'test', PASSWORD_BREACH_CHECK: 'true' })).toBe(true);
  });
});
