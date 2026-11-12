import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/env.js';
import {
  createEmailProvider,
  RESEND_SENDS_PER_SECOND,
  ResendEmailProvider,
  SmtpEmailProvider,
  StubEmailProvider,
} from './provider.js';

const base = { DATABASE_URL: 'postgres://x/y', NODE_ENV: 'test' as const, LOG_LEVEL: 'fatal' as const };

describe('createEmailProvider', () => {
  it('defaults to the stub when nothing is configured', () => {
    expect(createEmailProvider(loadConfig(base))).toBeInstanceOf(StubEmailProvider);
  });

  it('treats empty compose-substituted values as unconfigured (boots as stub)', () => {
    // exactly what docker-compose injects when the host .env sets nothing
    const cfg = loadConfig({
      ...base,
      RESEND_API_KEY: '',
      SMTP_URL: '',
      SMTP_HOST: '',
      SMTP_PORT: '587',
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_SECURE: 'false',
      EMAIL_FROM: 'Hevalo <no-reply@hevalo.app>',
    });
    expect(createEmailProvider(cfg)).toBeInstanceOf(StubEmailProvider);
  });

  it('uses Resend when RESEND_API_KEY is set', () => {
    const provider = createEmailProvider(loadConfig({ ...base, RESEND_API_KEY: 're_test' }));
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });

  it('uses SMTP when SMTP_HOST is set', () => {
    const provider = createEmailProvider(loadConfig({ ...base, SMTP_HOST: 'smtp.example.com' }));
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it('uses SMTP when only SMTP_URL is set', () => {
    const provider = createEmailProvider(loadConfig({ ...base, SMTP_URL: 'smtp://u:p@host:587' }));
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it('prefers Resend over SMTP when both are set', () => {
    const provider = createEmailProvider(
      loadConfig({ ...base, RESEND_API_KEY: 're_test', SMTP_HOST: 'smtp.example.com' }),
    );
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });
});

describe('ResendEmailProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs the message and returns the provider id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 }),
    );
    const provider = new ResendEmailProvider('re_secret', 'Hevalo <no-reply@hevalo.app>');
    const res = await provider.send({ to: 'user@example.com', subject: 'Hi', text: 'Your code is 123456' });

    expect(res.messageId).toBe('msg_123');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer re_secret');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      from: 'Hevalo <no-reply@hevalo.app>',
      to: 'user@example.com',
      subject: 'Hi',
      text: 'Your code is 123456',
    });
  });

  it('sends answers to the reply-to address, and lets one message come from elsewhere and thread', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"id":"m"}', { status: 200 }));
    const provider = createEmailProvider(
      loadConfig({ ...base, RESEND_API_KEY: 're_test', EMAIL_REPLY_TO: 'support@hevalo.app' }),
    );
    await provider.send({ to: 'user@example.com', subject: 'Reset', text: 'x' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toMatchObject({
      from: 'Hevalo <no-reply@hevalo.app>',
      reply_to: 'support@hevalo.app',
    });

    await provider.send({
      to: 'user@example.com',
      subject: 'Re: Help',
      text: 'y',
      from: 'Hevalo Support <support@hevalo.app>',
      headers: { 'In-Reply-To': '<a@b>', References: '<a@b>' },
    });
    const answer = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(answer).toMatchObject({ from: 'Hevalo Support <support@hevalo.app>', headers: { 'In-Reply-To': '<a@b>' } });
  });

  it('says nothing about replies when no reply-to is set (an empty one included)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"id":"m"}', { status: 200 }));
    await createEmailProvider(loadConfig({ ...base, RESEND_API_KEY: 're_test', EMAIL_REPLY_TO: '' })).send({
      to: 'user@example.com',
      subject: 'Hi',
      text: 'x',
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).not.toHaveProperty('reply_to');
  });

  it('names a send by its idempotency key, so a retry of it is not a second email', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"id":"m"}', { status: 200 }));
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    await provider.send({ to: 'u@e.com', subject: 's', text: 't', idempotencyKey: 'send-email/42@1793180000000' });
    await provider.send({ to: 'u@e.com', subject: 's', text: 't' });

    const keyed = fetchMock.mock.calls[0]![1]!;
    expect((keyed.headers as Record<string, string>)['Idempotency-Key']).toBe('send-email/42@1793180000000');
    // a request header, never part of the message
    expect(JSON.parse(keyed.body as string)).not.toHaveProperty('idempotencyKey');
    expect(fetchMock.mock.calls[1]![1]!.headers as Record<string, string>).not.toHaveProperty('Idempotency-Key');
  });

  it('throws on a non-2xx response so the job retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('domain not verified', { status: 422 }),
    );
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    await expect(provider.send({ to: 'u@e.com', subject: 's', text: 't' })).rejects.toThrow(/422/);
  });
});

/**
 * A rush: many people asking for a code in the same minute. The account may
 * ask the provider ten times a second, and the queue's workers are faster
 * than that, so sends take turns under the limit, and one that is still told
 * "too fast" waits and asks again instead of being lost.
 */
describe('ResendEmailProvider in a rush', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mail = (n: number) => ({ to: `u${n}@e.com`, subject: 's', text: 't', idempotencyKey: `send-email/${n}` });

  it('starts a hundred sends asked for at once no faster than the account may ask, and loses none', async () => {
    vi.useFakeTimers();
    const started: number[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      started.push(Date.now());
      return new Response('{"id":"m"}', { status: 200 });
    });
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    const all = Promise.all(Array.from({ length: 100 }, (_, n) => provider.send(mail(n))));
    await vi.runAllTimersAsync();
    expect(await all).toHaveLength(100);
    expect(started).toHaveLength(100);
    // in any one second, no more than the pace allows: which is under the account's ten
    expect(RESEND_SENDS_PER_SECOND).toBeLessThan(10);
    for (let i = 0; i + RESEND_SENDS_PER_SECOND < started.length; i++) {
      expect(started[i + RESEND_SENDS_PER_SECOND]! - started[i]!, `sends ${i} to ${i + RESEND_SENDS_PER_SECOND}`).toBeGreaterThanOrEqual(1000);
    }
    // and a hundred codes are still out within a quarter of a minute
    expect(started.at(-1)! - started[0]!).toBeLessThan(15_000);
  });

  it('does not hold up a single send', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"id":"m"}', { status: 200 }));
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    await provider.send(mail(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits as long as it is told when it is told “too fast”, then sends the same email once', async () => {
    vi.useFakeTimers();
    const calls: Array<{ at: number; key: string }> = [];
    const t0 = Date.now();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ at: Date.now() - t0, key: (init!.headers as Record<string, string>)['Idempotency-Key']! });
      return calls.length === 1
        ? new Response('{"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests"}', { status: 429, headers: { 'retry-after': '2' } })
        : new Response('{"id":"msg_after"}', { status: 200 });
    });
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    const sent = provider.send(mail(7));
    await vi.runAllTimersAsync();
    expect(await sent).toEqual({ messageId: 'msg_after' });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.at).toBeGreaterThanOrEqual(2000);
    // the same key both times: asked twice, it is still one email
    expect(calls.map((c) => c.key)).toEqual(['send-email/7', 'send-email/7']);
  });

  it('holds back what is waiting behind a send that was told “too fast”', async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    const calls: Array<{ at: number; to: string }> = [];
    let refused = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ at: Date.now() - t0, to: JSON.parse(init!.body as string).to });
      if (!refused) {
        refused = true;
        return new Response('rate_limit_exceeded', { status: 429, headers: { 'retry-after': '3' } });
      }
      return new Response('{"id":"m"}', { status: 200 });
    });
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    const both = Promise.all([provider.send(mail(1)), provider.send(mail(2))]);
    await vi.runAllTimersAsync();
    await both;
    // nothing was asked again inside the three seconds the provider asked for
    const during = calls.slice(1).filter((c) => c.at > 200 && c.at < 3000);
    expect(during, JSON.stringify(calls)).toEqual([]);
    expect(calls.filter((c) => c.to === 'u1@e.com')).toHaveLength(2);
  });

  it('gives the send back to the job after three refusals, to be tried again later', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('rate_limit_exceeded', { status: 429, headers: { 'retry-after': '1' } }));
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    const sent = provider.send(mail(1)).catch((err: Error) => err);
    await vi.runAllTimersAsync();
    expect(await sent).toBeInstanceOf(Error);
    expect(((await sent) as Error).message).toMatch(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not wait on an allowance that is used up: that does not pass in a second', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{"statusCode":429,"name":"monthly_quota_exceeded","message":"You have reached your monthly email sending quota."}', { status: 429 }),
    );
    const provider = new ResendEmailProvider('re_secret', 'no-reply@hevalo.app');
    await expect(provider.send(mail(1))).rejects.toThrow(/quota/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
