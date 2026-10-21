/**
 * The client's address as every route sees it, with the production
 * `TRUST_PROXY` (the private ranges and loopback), and the one log line that
 * shows how it was read.
 *
 * The first block goes over a real socket, because what is being relied on is
 * how Fastify reads the connection's own address and walks the header from it;
 * the rest use inject, which sets the socket address from an option.
 */
import { Writable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, trustProxyOption } from '../config/env.js';
import { setupClientIp } from './client-ip.js';

const EDGE = '172.71.146.118';
const CLIENT = '203.0.113.7';

function appWith(env: Record<string, string> = {}, lines?: string[]): FastifyInstance {
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines?.push(String(chunk));
      done();
    },
  });
  const app = Fastify({ logger: lines ? { level: 'info', stream } : false, trustProxy: trustProxyOption(config.TRUST_PROXY) });
  setupClientIp(app, config);
  // a later hook sees the resolved address too, as the rate limiter does
  app.addHook('onRequest', async (req) => {
    (req as unknown as { seenByHook: string }).seenByHook = req.ip;
  });
  app.get('/who', async (req) => ({ ip: req.ip, ips: req.ips, hook: (req as unknown as { seenByHook: string }).seenByHook }));
  app.get('/health', async () => ({ ok: true }));
  return app;
}

const servers: FastifyInstance[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

describe('over a real socket, from a balancer on loopback', () => {
  async function who(headers: Record<string, string>): Promise<{ ip: string; ips: string[]; hook: string }> {
    const app = appWith();
    await app.listen({ port: 0, host: '127.0.0.1' });
    servers.push(app);
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/who`, { headers });
    return (await res.json()) as { ip: string; ips: string[]; hook: string };
  }

  it('reads the client past a Cloudflare edge, and every later hook sees it', async () => {
    expect(await who({ 'x-forwarded-for': `${CLIENT}, ${EDGE}`, 'cf-connecting-ip': CLIENT })).toEqual({
      ip: CLIENT,
      ips: ['127.0.0.1', EDGE, CLIENT],
      hook: CLIENT,
    });
    expect((await who({ 'x-forwarded-for': `9.9.9.9, ${CLIENT}, ${EDGE}` })).ip).toBe(CLIENT);
  });

  it('keeps what TRUST_PROXY already did for a proxy that is not Cloudflare', async () => {
    expect(await who({ 'x-forwarded-for': `1.2.3.4, ${CLIENT}`, 'cf-connecting-ip': '1.2.3.4' })).toEqual({
      ip: CLIENT,
      ips: ['127.0.0.1', CLIENT],
      hook: CLIENT,
    });
  });
});

describe('through inject', () => {
  const ask = async (app: FastifyInstance, remoteAddress: string, headers: Record<string, string> = {}) =>
    (await app.inject({ url: '/who', remoteAddress, headers })).json() as { ip: string; ips: string[] };

  it('ignores Cloudflare headers from a caller that is not behind a trusted proxy', async () => {
    const app = appWith();
    expect((await ask(app, '198.51.100.50', { 'x-forwarded-for': `1.2.3.4, ${EDGE}`, 'cf-connecting-ip': '1.2.3.4' })).ip).toBe(
      '198.51.100.50',
    );
    await app.close();
  });

  it('can be switched off', async () => {
    const app = appWith({ CLOUDFLARE_CLIENT_IP: 'off' });
    expect((await ask(app, '10.1.2.3', { 'x-forwarded-for': `${CLIENT}, ${EDGE}`, 'cf-connecting-ip': CLIENT })).ip).toBe(EDGE);
    await app.close();
  });

  it('with TRUST_PROXY off reads no header, unless the socket is Cloudflare itself', async () => {
    const app = appWith({ TRUST_PROXY: 'false' });
    expect((await ask(app, '10.1.2.3', { 'x-forwarded-for': `${CLIENT}, ${EDGE}`, 'cf-connecting-ip': CLIENT })).ip).toBe('10.1.2.3');
    expect((await ask(app, EDGE, { 'cf-connecting-ip': CLIENT })).ip).toBe(CLIENT);
    await app.close();
  });

  it('normalises the address it reports', async () => {
    const app = appWith();
    expect((await ask(app, '::ffff:10.1.2.3', { 'x-forwarded-for': `${CLIENT}, ${EDGE}` })).ip).toBe(CLIENT);
    expect((await ask(app, '10.1.2.3', { 'x-forwarded-for': EDGE, 'cf-connecting-ip': '2001:0DB8::0001' })).ip).toBe('2001:db8::1');
    await app.close();
  });
});

describe('the proxy-chain log line', () => {
  it('is written once, on the first request that came through a proxy — not the health check', async () => {
    const lines: string[] = [];
    const app = appWith({}, lines);
    const chained = (l: string) => l.includes('client address on the first proxied request');
    await app.inject({ url: '/health', remoteAddress: '127.0.0.1' });
    expect(lines.filter(chained)).toHaveLength(0);
    await app.inject({
      url: '/who',
      remoteAddress: '10.1.2.3',
      headers: { 'x-forwarded-for': `${CLIENT}, ${EDGE}`, 'cf-connecting-ip': CLIENT },
    });
    await app.inject({ url: '/who', remoteAddress: '10.1.2.3', headers: { 'x-forwarded-for': `198.51.100.1, ${EDGE}` } });
    const logged = lines.filter(chained).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      trustProxy: 'loopback,linklocal,uniquelocal',
      cloudflare: 'auto',
      socket: '10.1.2.3',
      forwardedFor: `${CLIENT}, ${EDGE}`,
      cfConnectingIp: true,
      edge: EDGE,
      rule: 'cf-connecting-ip',
      resolvedIp: CLIENT,
    });
    await app.close();
  });
});
