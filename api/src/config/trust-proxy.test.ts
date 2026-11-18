/**
 * Who the server thinks is asking. These run over a real socket rather than `app.inject`, because the thing under
 * test is how fastify reads the connection's own address, which inject supplies from an option.
 */
import { afterAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { loadConfig, trustProxyOption } from './env.js';

const servers: Array<{ close: () => Promise<void> }> = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

/**
 * Asks a server configured this way what it thinks the client's address is. It listens on loopback, so the peer is
 * 127.0.0.1, as a platform load balancer looks from inside the container.
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
    // Each proxy appends the peer it saw, so the client's text sits left of the real address and is never reached.
    const chain = '1.2.3.4, 203.0.113.7'; // [client-supplied, written by the edge]
    expect(await resolvedIp('loopback', chain)).toBe('203.0.113.7');
    expect(await resolvedIp('loopback,uniquelocal', chain)).toBe('203.0.113.7');
  });

  /** A numeric hop count walks nothing, so a deploy with `TRUST_PROXY=1` would see every caller as its load balancer. */
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
    // `true` believes the client-written part of X-Forwarded-For.
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('accepts a proxy list, and defaults to the private ranges', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '10.0.0.0/8' }).TRUST_PROXY).toBe('10.0.0.0/8');
    expect(loadConfig(base).TRUST_PROXY).toBe('loopback,linklocal,uniquelocal');
  });

  /** A hop count fails silently, so the config refuses to start with one. */
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
