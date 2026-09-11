/**
 * Who the server thinks is asking.
 *
 * `req.ip` is what the rate limiter on /auth/login keys on, what the captcha is
 * told the caller's address is, and what signup and login risk scoring reason
 * about. Behind a proxy with nothing configured it is the proxy's address — so
 * "five login attempts per minute per IP" was five per minute for the whole
 * internet, and no abuse could be attributed to anyone.
 *
 * The fix is a hop count, and the count is the entire safety property: proxies
 * append to X-Forwarded-For, so whatever a client writes ends up furthest to the
 * left. Counting from the right can only ever reach an address a proxy wrote —
 * unless the count goes one too far, which is why it is a number rather than
 * `true`, and why production refuses `true`.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { loadConfig, trustProxyOption } from './env.js';

/** Ask a server configured this way what it thinks the client's address is. */
async function resolvedIp(trustProxy: string, forwardedFor?: string): Promise<string> {
  const app = Fastify({ logger: false, trustProxy: trustProxyOption(trustProxy) });
  app.get('/who', async (req) => ({ ip: req.ip }));
  const res = await app.inject({
    method: 'GET',
    url: '/who',
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    remoteAddress: '10.0.0.1', // the proxy that opened the connection
  });
  await app.close();
  return res.json().ip as string;
}

describe('trustProxyOption', () => {
  it('reads a hop count as a number, not a string', () => {
    // a string would be read as an IP list and match nothing
    expect(trustProxyOption('1')).toBe(1);
    expect(trustProxyOption('2')).toBe(2);
  });

  it('reads false as off', () => {
    expect(trustProxyOption('false')).toBe(false);
  });

  it('passes an address list through for Fastify to compile', () => {
    expect(trustProxyOption('10.0.0.0/8,192.168.0.1')).toBe('10.0.0.0/8,192.168.0.1');
  });
});

describe('the client address behind a proxy', () => {
  it('without trust, reports the proxy — which is the bug', async () => {
    expect(await resolvedIp('false', '203.0.113.7')).toBe('10.0.0.1');
  });

  it('with one hop, reports the address the proxy wrote', async () => {
    expect(await resolvedIp('1', '203.0.113.7')).toBe('203.0.113.7');
  });

  it('cannot be told who to believe by the client', async () => {
    // The client writes "1.2.3.4"; each proxy appends the peer it actually saw,
    // so the injected value is pushed left and the real one sits to its right.
    // Counting from the connection never reaches the client's own text.
    const chain = '1.2.3.4, 203.0.113.7'; // [client-supplied, written by the edge]
    expect(await resolvedIp('1', chain)).toBe('203.0.113.7');
  });

  it('a longer chain needs a bigger count, and a wrong one fails safe', async () => {
    // two proxies: the reader, then an edge, then the load balancer
    const chain = '198.51.100.9, 203.0.113.7';
    expect(await resolvedIp('2', chain)).toBe('198.51.100.9');
    // counting short lands on a proxy — useless, but never a forged address
    expect(await resolvedIp('1', chain)).toBe('203.0.113.7');
  });

  it('falls back to the connection when there is no header at all', async () => {
    // a native app talking straight to the origin sends no X-Forwarded-For
    expect(await resolvedIp('1')).toBe('10.0.0.1');
  });
});

describe('production configuration', () => {
  const base = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-production-secret-at-least-32-chars',
    APP_BASE_URL: 'https://mykurda.com',
    DATABASE_URL: 'postgres://u:p@localhost:5432/kurda',
  };

  it('refuses to boot trusting a client-supplied header', () => {
    // `true` means the whole X-Forwarded-For is believed, including the part the
    // client wrote — anyone could then claim an address, get their own rate-limit
    // bucket and a clean risk score, and put somebody else's name in the logs
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('accepts a hop count, and defaults to one', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '2' }).TRUST_PROXY).toBe('2');
    expect(loadConfig(base).TRUST_PROXY).toBe('1');
  });

  it('still allows turning it off where there is no proxy', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe('false');
  });

  it('rejects something that is neither a count nor an address list', () => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'yes please' })).toThrow(/TRUST_PROXY/);
  });
});
