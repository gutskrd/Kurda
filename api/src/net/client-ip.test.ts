/**
 * Reading the client's address past the proxies, and not being told it by the
 * client. `trusted` here is what the default `TRUST_PROXY`
 * (`loopback,linklocal,uniquelocal`) trusts: every private range and loopback.
 */
import { describe, expect, it } from 'vitest';
import { MAX_FORWARDED_HOPS, resolveClientIp, type ClientIpInput } from './client-ip.js';
import { inCidr, parseCidr, parseIp } from './ip.js';
import { networkKey } from './network-key.js';

const PRIVATE = ['127.0.0.0/8', '::1/128', '169.254.0.0/16', 'fe80::/10', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'].map(
  parseCidr,
);
const privateOnly = (address: string): boolean => {
  const ip = parseIp(address);
  return ip !== null && PRIVATE.some((r) => inCidr(ip, r));
};

const RENDER = '10.204.31.7'; // Render's balancer, as the container sees it
const EDGE = '172.71.146.118'; // a Cloudflare edge (172.64.0.0/13)
const EDGE6 = '2400:cb00:2048:1::c629:d7a2'; // a Cloudflare edge over IPv6
const CLIENT = '203.0.113.7';

const resolve = (over: Partial<ClientIpInput>) =>
  resolveClientIp({ socket: RENDER, forwardedFor: undefined, cfConnectingIp: undefined, trusted: privateOnly, ...over });

describe('the production chain: client → Cloudflare → Render → us', () => {
  it('takes the client from CF-Connecting-IP when the edge is Cloudflare', () => {
    expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}`, cfConnectingIp: CLIENT })).toEqual({
      ip: CLIENT,
      rule: 'cf-connecting-ip',
      edge: EDGE,
      chain: [RENDER, EDGE, CLIENT],
    });
  });

  it('falls back to the entry Cloudflare wrote, just left of the edge', () => {
    expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}` })).toMatchObject({ ip: CLIENT, rule: 'xff-left-of-edge', edge: EDGE });
  });

  it('works the same through an IPv6 edge, and for an IPv6 client', () => {
    const client6 = '2001:db8:abcd:12::5';
    expect(resolve({ forwardedFor: `${client6}, ${EDGE6}` })).toMatchObject({ ip: client6, rule: 'xff-left-of-edge', edge: EDGE6 });
    expect(resolve({ forwardedFor: `${client6}, ${EDGE6}`, cfConnectingIp: client6 })).toMatchObject({ ip: client6, rule: 'cf-connecting-ip' });
  });

  it('keeps the edge when Cloudflare said nothing usable', () => {
    expect(resolve({ forwardedFor: EDGE })).toMatchObject({ ip: EDGE, rule: 'edge' });
    expect(resolve({ forwardedFor: `garbage, ${EDGE}`, cfConnectingIp: 'also garbage' })).toMatchObject({ ip: EDGE, rule: 'edge' });
  });

  it('prefers CF-Connecting-IP, which Cloudflare always overwrites, to the header entry', () => {
    expect(resolve({ forwardedFor: `198.51.100.1, ${EDGE}`, cfConnectingIp: CLIENT })).toMatchObject({ ip: CLIENT });
  });

  it('walks past several trusted hops, asking about each by its position', () => {
    const asked: Array<[string, number]> = [];
    const r = resolve({
      forwardedFor: `${CLIENT}, ${EDGE}, 10.0.0.9`,
      trusted: (a, i) => {
        asked.push([a, i]);
        return privateOnly(a);
      },
    });
    expect(r).toMatchObject({ ip: CLIENT, edge: EDGE, chain: [RENDER, '10.0.0.9', EDGE, CLIENT] });
    expect(asked).toEqual([
      [RENDER, 0],
      ['10.0.0.9', 1],
      [EDGE, 2],
    ]);
  });

  it('can be switched off, leaving the edge as the caller', () => {
    expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}`, cfConnectingIp: CLIENT, cloudflare: false })).toMatchObject({
      ip: EDGE,
      rule: 'edge',
    });
  });

  it('reads Cloudflare when Cloudflare is the socket itself (an origin with no balancer)', () => {
    expect(resolve({ socket: EDGE, cfConnectingIp: CLIENT })).toMatchObject({ ip: CLIENT, rule: 'cf-connecting-ip', chain: [EDGE, CLIENT] });
  });
});

describe('what a client cannot do', () => {
  it('cannot name itself in X-Forwarded-For: its text sits left of Cloudflare’s entry and is never read', () => {
    for (const spoof of ['1.2.3.4', '1.2.3.4, 5.6.7.8', '10.0.0.1', EDGE, '2a06:98c0:3600::103']) {
      expect(resolve({ forwardedFor: `${spoof}, ${CLIENT}, ${EDGE}` }).ip).toBe(CLIENT);
      expect(resolve({ forwardedFor: `${spoof}, ${CLIENT}, ${EDGE}`, cfConnectingIp: CLIENT }).ip).toBe(CLIENT);
    }
  });

  it('cannot send CF-Connecting-IP past an edge that is not Cloudflare', () => {
    // straight at the balancer, from an ordinary address
    expect(resolve({ forwardedFor: '198.51.100.50', cfConnectingIp: '1.2.3.4' })).toMatchObject({ ip: '198.51.100.50', rule: 'edge' });
    // straight at the container, with no trusted proxy at all
    expect(resolve({ socket: '198.51.100.50', forwardedFor: `1.2.3.4, ${EDGE}`, cfConnectingIp: '1.2.3.4' })).toMatchObject({
      ip: '198.51.100.50',
      rule: 'edge',
    });
  });

  it('cannot reach Cloudflare’s rules by writing a Cloudflare address where the edge would be', () => {
    // the client writes a Cloudflare address, but the edge the balancer saw is the client itself
    expect(resolve({ forwardedFor: `${EDGE}, 198.51.100.50`, cfConnectingIp: '1.2.3.4' }).ip).toBe('198.51.100.50');
  });

  it('a caller on Cloudflare’s own network is one caller, not another proxy to walk past', () => {
    // a Worker's cross-zone subrequest arrives as 2a06:98c0:3600::103
    const worker = '2a06:98c0:3600::103';
    expect(resolve({ forwardedFor: `6.6.6.6, ${worker}, ${EDGE}`, cfConnectingIp: worker })).toMatchObject({
      ip: worker,
      rule: 'cf-connecting-ip',
    });
    expect(resolve({ forwardedFor: `6.6.6.6, ${worker}, ${EDGE}` })).toMatchObject({ ip: worker, rule: 'xff-left-of-edge' });
    // and every such caller shares a network, so it shares a rate-limit budget
    expect(networkKey(worker)).toBe(networkKey('2a06:98c0:3600::1'));
  });
});

describe('what the headers might hold', () => {
  it('reads an address with a port, in brackets, with a zone, or IPv4-mapped', () => {
    expect(resolve({ forwardedFor: `${CLIENT}:51234, ${EDGE}` }).ip).toBe(CLIENT);
    expect(resolve({ forwardedFor: `[2001:db8::1]:443, ${EDGE}` }).ip).toBe('2001:db8::1');
    expect(resolve({ forwardedFor: EDGE, cfConnectingIp: '[::1]:443' }).ip).toBe('::1');
    expect(resolve({ forwardedFor: EDGE, cfConnectingIp: 'fe80::1%eth0' }).ip).toBe('fe80::1');
    expect(resolve({ forwardedFor: EDGE, cfConnectingIp: '::ffff:1.2.3.4' }).ip).toBe('1.2.3.4');
    expect(resolve({ forwardedFor: EDGE, cfConnectingIp: '2001:0DB8:0000:0000:0000:0000:0000:0001' }).ip).toBe('2001:db8::1');
    // the edge itself through a dual-stack socket's mapped form
    expect(resolve({ forwardedFor: `${CLIENT}, ::ffff:${EDGE}` })).toMatchObject({ ip: CLIENT, rule: 'xff-left-of-edge' });
  });

  it('refuses what is not one address', () => {
    for (const bad of ['', 'unknown', 'not-an-ip', '1.2.3', '256.1.1.1', '01.2.3.4', '1.2.3.4.5', '1.2.3.4%eth0', '2001:db8::1::2', '[::1', '[::1]:x']) {
      expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}`, cfConnectingIp: bad })).toMatchObject({ ip: CLIENT, rule: 'xff-left-of-edge' });
    }
  });

  it('refuses a repeated CF-Connecting-IP, which arrives joined or as a list', () => {
    expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}`, cfConnectingIp: '1.2.3.4, 5.6.7.8' }).ip).toBe(CLIENT);
    expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}`, cfConnectingIp: ['1.2.3.4', '5.6.7.8'] }).ip).toBe(CLIENT);
    expect(resolve({ forwardedFor: `${CLIENT}, ${EDGE}`, cfConnectingIp: 42 }).ip).toBe(CLIENT);
  });

  it('reads repeated X-Forwarded-For lines as Node joins them, and ignores a list it would not produce', () => {
    expect(resolve({ forwardedFor: `9.9.9.9, ${CLIENT}, ${EDGE}` }).ip).toBe(CLIENT);
    expect(resolve({ forwardedFor: [CLIENT, EDGE] })).toMatchObject({ ip: RENDER, rule: 'edge' });
  });

  it('skips empty entries and spaces', () => {
    expect(resolve({ forwardedFor: ` , ,${CLIENT} ,, ${EDGE} ,` }).ip).toBe(CLIENT);
  });

  it('falls back to the proxy that wrote it when the edge entry is not an address', () => {
    expect(resolve({ forwardedFor: 'unknown' })).toMatchObject({ ip: RENDER, rule: 'edge', edge: 'unknown', chain: [RENDER] });
    expect(resolve({ socket: '10.0.0.1', forwardedFor: 'unknown, 10.0.0.2' })).toMatchObject({ ip: '10.0.0.2', chain: ['10.0.0.1', '10.0.0.2'] });
  });

  it('takes the last hop when every hop is trusted, as Fastify does', () => {
    expect(resolve({ forwardedFor: '10.0.0.2' })).toMatchObject({ ip: '10.0.0.2', rule: 'edge' });
  });

  it('is the socket itself for a health check with no header', () => {
    expect(resolve({ socket: '127.0.0.1' })).toEqual({ ip: '127.0.0.1', rule: 'edge', edge: '127.0.0.1', chain: ['127.0.0.1'] });
  });

  it('handles a huge header quickly and still finds the client', () => {
    const padded = `${new Array(20_000).fill('1.1.1.1').join(', ')}, ${CLIENT}, ${EDGE}`;
    const started = Date.now();
    expect(resolve({ forwardedFor: padded }).ip).toBe(CLIENT);
    expect(resolve({ forwardedFor: EDGE, cfConnectingIp: '1'.repeat(100_000) }).ip).toBe(EDGE);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('looks at no more than the right-most entries', () => {
    const many = new Array(MAX_FORWARDED_HOPS + 5).fill('10.0.0.3').join(', ');
    // all trusted: the walk ends at the last entry it looked at
    expect(resolve({ forwardedFor: `${CLIENT}, ${many}` })).toMatchObject({ ip: '10.0.0.3' });
  });
});
