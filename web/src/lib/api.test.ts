import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient, describeError } from './api';
import { createTokenStorage } from './tokenStorage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('describeError', () => {
  it('gives friendly copy per error kind', () => {
    expect(describeError({ kind: 'network', message: 'x' })).toMatch(/connection/i);
    expect(describeError({ kind: 'server', message: 'x' })).toMatch(/our end/i);
    expect(describeError({ kind: 'rate_limited', message: 'x', retryAfterSec: 5 })).toMatch(/5s/);
    expect(describeError({ kind: 'client', message: 'Email already taken' })).toBe('Email already taken');
  });
});

describe('ApiClient', () => {
  it('returns typed data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { hello: 'world' })),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.get<{ hello: string }>('/thing');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.hello).toBe('world');
  });

  it('maps an error envelope to a typed client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'bad input' })),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.get('/thing');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('client');
      expect(res.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('surfaces a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.get('/thing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('network');
  });

  it('attaches an Idempotency-Key to mutating requests', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    await client.post('/thing', { a: 1 });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeTruthy();
    expect(headers['content-type']).toBe('application/json');
  });
});
