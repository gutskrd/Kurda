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
      EMAIL_FROM: 'MyKurda <no-reply@mykurda.app>',
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
    const provider = new ResendEmailProvider('re_secret', 'MyKurda <no-reply@mykurda.app>');
    const res = await provider.send({ to: 'user@example.com', subject: 'Hi', text: 'Your code is 123456' });

    expect(res.messageId).toBe('msg_123');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer re_secret');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      from: 'MyKurda <no-reply@mykurda.app>',
      to: 'user@example.com',
      subject: 'Hi',
      text: 'Your code is 123456',
    });
  });

  it('throws on a non-2xx response so the job retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('domain not verified', { status: 422 }),
    );
    const provider = new ResendEmailProvider('re_secret', 'no-reply@mykurda.app');
    await expect(provider.send({ to: 'u@e.com', subject: 's', text: 't' })).rejects.toThrow(/422/);
  });
});
