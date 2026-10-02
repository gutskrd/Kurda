/**
 * Who the server thinks is asking.
 *
 * `req.ip` is what the rate limiter on /auth/login keys on, what the captcha is
 * told the caller's address is, and what signup and login risk scoring reason
 * about. Behind a proxy with nothing configured it is the proxy's address — so
 * "five login attempts per minute per IP" was five per minute for the whole
 * internet, and no abuse could be attributed to anyone.
 *
 * This was a hop count until fastify 5.12.5 fixed GHSA-3m5p-2c4r-xxw2 by making
 * a numeric `trustProxy` consume no hop at all. The proxies are **named** now,
 * which carries the same safety property more directly: Fastify walks
 * X-Forwarded-For from the right and stops at the first address not on the
 * list, and because each hop appends the peer it actually saw, whatever a
 * client writes sits furthest LEFT and is never reached.
 *
 * These go over a real socket rather than through `app.inject`, because the
 * thing under test is how Fastify reads the connection's own address, and
 * inject supplies that from an option instead of from a socket.
 */
import { afterAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { loadConfig, trustProxyOption } from './env.js';

const servers: Array<{ close: () => Promise<void> }> = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

/**
 * Ask a server configured this way what it thinks the client's address is.
 *
 * It listens on loopback, so the connection's peer is 127.0.0.1 — which is what
 * `loopback` in a trust list names, and what a managed platform's load balancer
 * looks like from inside the container.
 */
async function resolvedIp(trustProxy: string, forwardedFor?: string): Promise<string> {
  const app = Fastify({ logger: false, trustProxy: trustProxyOption(trustProxy) });
  app.get('/who', async (req) => ({ ip: req.ip }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  servers.push({ close: () => app.close() });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const res = await fetch(`http://127.0.0.1:${port}/who`, {
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  });
  return ((await res.json()) as { ip: string }).ip;
}

describe('trustProxyOption', () => {
  it('reads false as off', () => {
    expect(trustProxyOption('false')).toBe(false);
  });

  it('passes a proxy list through for Fastify to compile', () => {
    expect(trustProxyOption('10.0.0.0/8,192.168.0.1')).toBe('10.0.0.0/8,192.168.0.1');
    expect(trustProxyOption('loopback,uniquelocal')).toBe('loopback,uniquelocal');
  });
});

describe('the client address behind a proxy', () => {
  it('without trust, reports the proxy — which is the bug', async () => {
    expect(await resolvedIp('false', '203.0.113.7')).toBe('127.0.0.1');
  });

  it('with the proxy named, reports the address the proxy wrote', async () => {
    expect(await resolvedIp('loopback', '203.0.113.7')).toBe('203.0.113.7');
  });

  it('cannot be told who to believe by the client', async () => {
    // The client writes "1.2.3.4"; each proxy appends the peer it actually saw,
    // so the injected value is pushed left and the real one sits to its right.
    // Walking from the connection stops before the client's own text.
    const chain = '1.2.3.4, 203.0.113.7'; // [client-supplied, written by the edge]
    expect(await resolvedIp('loopback', chain)).toBe('203.0.113.7');
    expect(await resolvedIp('loopback,uniquelocal', chain)).toBe('203.0.113.7');
  });

  /**
   * The regression that made this rewrite necessary. Under fastify 5.11 a hop
   * count walked the header; under 5.12.5 it consumes nothing, so a deploy
   * still carrying `TRUST_PROXY=1` would attribute every request on earth to
   * its own load balancer and never say so. The config refuses it at boot —
   * this pins down the behaviour that refusal exists for.
   */
  it('gets nothing from a bare hop count, which is why one is refused', async () => {
    expect(await resolvedIp('1', '203.0.113.7')).toBe('127.0.0.1');
    expect(await resolvedIp('2', '198.51.100.9, 203.0.113.7')).toBe('127.0.0.1');
  });

  it('falls back to the connection when there is no header at all', async () => {
    // a native app talking straight to the origin sends no X-Forwarded-For
    expect(await resolvedIp('loopback')).toBe('127.0.0.1');
  });
});

describe('production configuration', () => {
  const base = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-production-secret-at-least-32-chars',
    APP_BASE_URL: 'https://hevalo.app',
    DATABASE_URL: 'postgres://u:p@localhost:5432/kurda',
  };

  it('refuses to boot trusting a client-supplied header', () => {
    // `true` means the whole X-Forwarded-For is believed, including the part the
    // client wrote — anyone could then claim an address, get their own rate-limit
    // bucket and a clean risk score, and put somebody else's name in the logs
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('accepts a proxy list, and defaults to the private ranges', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '10.0.0.0/8' }).TRUST_PROXY).toBe('10.0.0.0/8');
    expect(loadConfig(base).TRUST_PROXY).toBe('loopback,linklocal,uniquelocal');
  });

  /**
   * A hop count is not merely wrong now, it is quiet: fastify 5.12.5 made a
   * numeric `trustProxy` consume no hop, so a deploy carrying the old
   * `TRUST_PROXY=1` would boot, serve, and rate-limit the whole internet as one
   * caller without a word. Better to refuse to start.
   */
  it('refuses a hop count, which fastify 5.12.5 made a silent no-op', () => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: '1' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ ...base, TRUST_PROXY: '2' })).toThrow(/hop count/);
  });

  it('still allows turning it off where there is no proxy', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe('false');
  });

  it('rejects something that is neither a count nor an address list', () => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'yes please' })).toThrow(/TRUST_PROXY/);
  });
});
