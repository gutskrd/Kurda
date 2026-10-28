import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/env.js';
import {
  createEmailProvider,
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
