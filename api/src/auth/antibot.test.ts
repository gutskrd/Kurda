import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/env.js';
import { verifyCaptcha } from './captcha.js';
import { isDisposableEmail } from './disposable-domains.js';

describe('isDisposableEmail', () => {
  it('blocks known disposable domains, case-insensitively', () => {
    expect(isDisposableEmail('bot@mailinator.com')).toBe(true);
    expect(isDisposableEmail('bot@YOPMAIL.com')).toBe(true);
    expect(isDisposableEmail('bot@temp-mail.org')).toBe(true);
  });

  it('catches subdomains of blocked domains', () => {
    expect(isDisposableEmail('bot@mail.mailinator.com')).toBe(true);
  });

  it('allows normal providers', () => {
    expect(isDisposableEmail('rojda@gmail.com')).toBe(false);
    expect(isDisposableEmail('şêrîn@kurda.app')).toBe(false);
    // similar-looking but different domain must not match
    expect(isDisposableEmail('a@notmailinator.com')).toBe(false);
  });
});

describe('verifyCaptcha', () => {
  const withSecret = loadConfig({ NODE_ENV: 'test', TURNSTILE_SECRET: 'ts-secret' });

  it('passes when CAPTCHA is not configured (dev/test)', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(await verifyCaptcha(config, undefined, '1.2.3.4')).toBe(true);
  });

  it('fails without a token when configured', async () => {
    const fetchFn = vi.fn();
    expect(await verifyCaptcha(withSecret, undefined, '1.2.3.4', fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('verifies the token with Turnstile (secret + response + ip)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    expect(await verifyCaptcha(withSecret, 'tok-123', '1.2.3.4', fetchFn)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain('challenges.cloudflare.com');
    expect(init.body).toContain('secret=ts-secret');
    expect(init.body).toContain('response=tok-123');
    expect(init.body).toContain('remoteip=1.2.3.4');
  });

  it('rejects when Turnstile says no', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    expect(await verifyCaptcha(withSecret, 'bad-token', undefined, fetchFn)).toBe(false);
  });

  it('provider outage: fail-closed by default, fail-open when configured', async () => {
    const down = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await verifyCaptcha(withSecret, 'tok', undefined, down)).toBe(false);

    const failOpen = loadConfig({
      NODE_ENV: 'test',
      TURNSTILE_SECRET: 'ts-secret',
      CAPTCHA_FAIL_OPEN: 'true',
    });
    expect(await verifyCaptcha(failOpen, 'tok', undefined, down)).toBe(true);
  });
});
