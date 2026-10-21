import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/env.js';
import {
  createPushProvider,
  EXPO_CHUNK_SIZE,
  EXPO_PUSH_URL,
  ExpoPushProvider,
  StubPushProvider,
  type PushMessage,
  type PushPlatform,
} from './provider.js';
import { isExpoPushToken } from './tokens-service.js';

const token = (i: number) => `ExponentPushToken[tok${i}]`;
const msg = (i: number, platform: PushPlatform = 'ios', over: Partial<PushMessage> = {}): PushMessage => ({
  token: token(i),
  platform,
  title: 'A few minutes of Kurdish?',
  body: 'One short lesson counts for today.',
  ...over,
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A fetch that answers every chunk with one ok ticket per message, and remembers what it was sent. */
function okFetch() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as unknown[];
    return json({ data: sent.map((_, i) => ({ status: 'ok', id: `t${i}` })) });
  });
}

const noWait = () => Promise.resolve();
const silentLog = () => ({ warn: vi.fn() });

describe('ExpoPushProvider', () => {
  it('posts JSON to Expo with the message, the default sound and the Android channel', async () => {
    const fetch = okFetch();
    const provider = new ExpoPushProvider({ fetch, sleep: noWait });
    const res = await provider.send([
      msg(1, 'android', { data: { kind: 'badge', category: 'progress' } }),
      msg(2, 'ios', { ttlSeconds: 7200 }),
    ]);
    expect(res).toEqual({ sent: 2, invalidTokens: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(init?.body))).toEqual([
      {
        to: token(1),
        title: 'A few minutes of Kurdish?',
        body: 'One short lesson counts for today.',
        data: { kind: 'badge', category: 'progress' },
        sound: 'default',
        channelId: 'default',
      },
      { to: token(2), title: 'A few minutes of Kurdish?', body: 'One short lesson counts for today.', sound: 'default', ttl: 7200 },
    ]);
  });

  it('sends the access token as a bearer token when one is configured', async () => {
    const fetch = okFetch();
    await new ExpoPushProvider({ fetch, accessToken: 'expo-secret' }).send([msg(1)]);
    expect((fetch.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toBe('Bearer expo-secret');
  });

  it('splits more than 100 messages into requests of at most 100', async () => {
    const fetch = okFetch();
    const messages = Array.from({ length: 2 * EXPO_CHUNK_SIZE + 5 }, (_, i) => msg(i));
    const res = await new ExpoPushProvider({ fetch }).send(messages);
    expect(fetch).toHaveBeenCalledTimes(3);
    const sizes = fetch.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as unknown[]).length);
    expect(sizes).toEqual([100, 100, 5]);
    // in order, nobody twice, nobody left out
    const recipients = fetch.mock.calls.flatMap(([, init]) => (JSON.parse(String(init?.body)) as { to: string }[]).map((m) => m.to));
    expect(recipients).toEqual(messages.map((m) => m.token));
    expect(res.sent).toBe(205);
  });

  it('sends nothing for no messages', async () => {
    const fetch = okFetch();
    expect(await new ExpoPushProvider({ fetch }).send([])).toEqual({ sent: 0, invalidTokens: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hands back DeviceNotRegistered tokens for pruning, and only logs other ticket errors', async () => {
    const log = silentLog();
    const fetch = vi.fn(async () =>
      json({
        data: [
          { status: 'ok', id: 'a' },
          { status: 'error', message: 'not a registered push notification recipient', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
          { status: 'ok', id: 'd' },
        ],
      }),
    );
    const res = await new ExpoPushProvider({ fetch, log }).send([msg(1), msg(2), msg(3), msg(4)]);
    expect(res).toEqual({ sent: 2, invalidTokens: [token(2)] });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ error: 'MessageTooBig' });
    // a phone's address stays out of the log
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('ExponentPushToken');
  });

  it('retries a 5xx once after a pause, then delivers', async () => {
    const sleep = vi.fn(noWait);
    const ok = okFetch();
    const fetch = vi
      .fn<typeof ok>()
      .mockImplementationOnce(async () => new Response('upstream sad', { status: 503 }))
      .mockImplementation(ok);
    const res = await new ExpoPushProvider({ fetch, sleep, retryDelayMs: 1234 }).send([msg(1), msg(2)]);
    expect(res).toEqual({ sent: 2, invalidTokens: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1234);
  });

  it('retries a dropped connection once', async () => {
    const ok = okFetch();
    const fetch = vi
      .fn<typeof ok>()
      .mockImplementationOnce(async () => {
        throw new TypeError('fetch failed');
      })
      .mockImplementation(ok);
    expect(await new ExpoPushProvider({ fetch, sleep: noWait }).send([msg(1)])).toEqual({ sent: 1, invalidTokens: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('logs and drops a chunk that fails twice, and carries on with the next one', async () => {
    const log = silentLog();
    const ok = okFetch();
    const fetch = vi
      .fn<typeof ok>()
      .mockImplementationOnce(async () => new Response('', { status: 502 }))
      .mockImplementationOnce(async () => {
        throw new TypeError('fetch failed');
      })
      .mockImplementation(ok);
    const messages = Array.from({ length: EXPO_CHUNK_SIZE + 1 }, (_, i) => msg(i));
    const res = await new ExpoPushProvider({ fetch, sleep: noWait, log }).send(messages);
    // the first hundred are dropped, the last one goes
    expect(res).toEqual({ sent: 1, invalidTokens: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ provider: 'expo', messages: 100, attempts: 2 }), 'push chunk dropped');
  });

  it('does not retry a request Expo refused as malformed', async () => {
    const log = silentLog();
    const sleep = vi.fn(noWait);
    const fetch = vi.fn(async () => json({ errors: [{ code: 'VALIDATION_ERROR', message: 'bad' }] }, 400));
    expect(await new ExpoPushProvider({ fetch, sleep, log }).send([msg(1)])).toEqual({ sent: 0, invalidTokens: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ status: 400, attempts: 1 }), 'push chunk dropped');
  });

  it('retries a 429 like any other passing trouble', async () => {
    const ok = okFetch();
    const fetch = vi
      .fn<typeof ok>()
      .mockImplementationOnce(async () => new Response('', { status: 429 }))
      .mockImplementation(ok);
    expect((await new ExpoPushProvider({ fetch, sleep: noWait }).send([msg(1)])).sent).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('is heard through a replaced global fetch when none is given', async () => {
    const fetch = okFetch();
    vi.stubGlobal('fetch', fetch);
    try {
      expect(await new ExpoPushProvider().send([msg(1)])).toEqual({ sent: 1, invalidTokens: [] });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createPushProvider', () => {
  const config = (env: Record<string, string>) => loadConfig({ LOG_LEVEL: 'fatal', ...env });

  it('is the stub under test and in development, so nobody is pushed by accident', () => {
    expect(createPushProvider(config({ NODE_ENV: 'test' }))).toBeInstanceOf(StubPushProvider);
    expect(createPushProvider(config({ NODE_ENV: 'development' }))).toBeInstanceOf(StubPushProvider);
  });

  it('follows PUSH_PROVIDER when it is set', () => {
    expect(createPushProvider(config({ NODE_ENV: 'test', PUSH_PROVIDER: 'expo' }))).toBeInstanceOf(ExpoPushProvider);
    expect(createPushProvider(config({ NODE_ENV: 'development', PUSH_PROVIDER: 'stub' }))).toBeInstanceOf(StubPushProvider);
  });

  it('refuses a provider it does not know', () => {
    expect(() => config({ NODE_ENV: 'test', PUSH_PROVIDER: 'fcm' })).toThrow(/PUSH_PROVIDER/);
  });
});

describe('isExpoPushToken', () => {
  it('accepts both spellings Expo issues', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[N1Ba9ACc4LMn5mMcyU5XxY]')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[a-b_c]')).toBe(true);
  });

  it('refuses anything else', () => {
    for (const junk of [
      '',
      'hello',
      'tok-a-ios-1',
      'ExponentPushToken[]',
      'ExponentPushToken[abc',
      'ExponentPushToken[abc] ',
      ' ExponentPushToken[abc]',
      'ExponentPushToken[ab c]',
      'ExponentPushToken[<script>]',
      'ExponentPushToken[abc][def]',
      'exponentpushtoken[abc]',
      `ExponentPushToken[${'a'.repeat(201)}]`,
      // a raw APNs device token is not what the server sends to
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    ]) {
      expect(isExpoPushToken(junk), junk).toBe(false);
    }
  });
});
