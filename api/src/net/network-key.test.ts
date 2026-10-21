import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DEV_JWT_SECRET } from '../config/env.js';
import { setModerationKey } from '../moderation/pseudonym.js';
import { isCloudflareAddress } from './cloudflare.js';
import { parseIp } from './ip.js';
import { networkHashOf, networkKey } from './network-key.js';

describe('networkKey', () => {
  it('is the address itself for IPv4', () => {
    expect(networkKey('203.0.113.7')).toBe('203.0.113.7');
    expect(networkKey('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(networkKey(' 10.0.0.1 ')).toBe('10.0.0.1');
  });

  it('reads an IPv4-mapped IPv6 address as the IPv4 address it carries', () => {
    expect(networkKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(networkKey('::FFFF:cb00:7107')).toBe('203.0.113.7');
    expect(networkKey('[::ffff:203.0.113.7]:443')).toBe('203.0.113.7');
  });

  it('is the /64 for IPv6, however the address is written', () => {
    const key = '2001:db8:abcd:12::/64';
    for (const a of [
      '2001:db8:abcd:12:1:2:3:4',
      '2001:0DB8:ABCD:0012:0000:0000:0000:0001',
      '2001:db8:abcd:12::1',
      '2001:db8:abcd:12:ffff:ffff:ffff:ffff',
      '[2001:db8:abcd:12::99]:443',
      '2001:db8:abcd:12::1%en0',
    ]) {
      expect(networkKey(a)).toBe(key);
    }
    expect(networkKey('2001:db8::1')).toBe('2001:db8::/64');
    expect(networkKey('2001:db8:0:0:ffff::1')).toBe('2001:db8::/64');
    expect(networkKey('2001:db8:0:1::1')).toBe('2001:db8:0:1::/64');
    expect(networkKey('::1')).toBe('::/64');
    expect(networkKey('fe80::1%eth0')).toBe('fe80::/64');
    expect(networkKey('64:ff9b::1.2.3.4')).toBe('64:ff9b::/64');
  });

  it('tells neighbouring /64s apart', () => {
    expect(networkKey('2001:db8:abcd:12::1')).not.toBe(networkKey('2001:db8:abcd:13::1'));
  });

  it('is null for anything that is not one address', () => {
    for (const bad of [
      '',
      ' ',
      'unknown',
      '1.2.3',
      '256.1.1.1',
      '01.2.3.4',
      '1.2.3.4.5',
      '1.2.3.4%eth0',
      '1.2.3.4, 5.6.7.8',
      '2001:db8::1::2',
      '2001:db8:::1',
      '[2001:db8::1',
      '[2001:db8::1]:port',
      '2001:db8::1:443:1:1:1:1:1',
      'x'.repeat(1000),
      null,
      undefined,
    ]) {
      expect(networkKey(bad)).toBeNull();
    }
  });
});

describe('parseIp', () => {
  it('writes IPv6 in the RFC 5952 form', () => {
    expect(parseIp('2001:DB8:0:0:1:0:0:1')!.text).toBe('2001:db8::1:0:0:1');
    expect(parseIp('2001:0:0:1:0:0:0:1')!.text).toBe('2001:0:0:1::1');
    expect(parseIp('2001:db8:0:1:1:1:1:1')!.text).toBe('2001:db8:0:1:1:1:1:1');
    expect(parseIp('::')!.text).toBe('::');
    expect(parseIp('1::')!.text).toBe('1::');
  });
});

describe('isCloudflareAddress', () => {
  it('knows the edge addresses seen in production, and not ordinary ones', () => {
    for (const a of ['172.71.146.118', '172.71.150.32', '104.16.0.1', '162.159.1.1', '2400:cb00:2048:1::c629:d7a2', '2a06:98c0:3600::103']) {
      expect(isCloudflareAddress(parseIp(a)!)).toBe(true);
    }
    for (const a of ['203.0.113.7', '172.63.255.255', '172.72.0.0', '10.0.0.1', '2001:db8::1', '2a06:98c8::1']) {
      expect(isCloudflareAddress(parseIp(a)!)).toBe(false);
    }
  });
});

describe('networkHashOf', () => {
  afterEach(() => setModerationKey(DEV_JWT_SECRET));

  it('is one keyed hash per network, never the plain hash of the address', () => {
    const h = networkHashOf('2001:db8:abcd:12::1')!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(networkHashOf('2001:db8:abcd:12:9:9:9:9')).toBe(h);
    expect(networkHashOf('2001:db8:abcd:13::1')).not.toBe(h);
    expect(networkHashOf('203.0.113.7')).not.toBe(createHash('sha256').update('203.0.113.7').digest('hex'));
    expect(networkHashOf('::ffff:203.0.113.7')).toBe(networkHashOf('203.0.113.7'));
    expect(networkHashOf('unknown')).toBeNull();
  });

  it('changes with the server secret', () => {
    const before = networkHashOf('203.0.113.7');
    setModerationKey('another-server-secret-that-is-long-enough');
    expect(networkHashOf('203.0.113.7')).not.toBe(before);
  });
});
