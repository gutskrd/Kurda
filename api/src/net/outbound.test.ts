import { describe, expect, it } from 'vitest';
import { fetchFromAllowedHost, isPublicAddress, OutboundError, type Lookup } from './outbound.js';

describe('isPublicAddress', () => {
  it('takes public unicast addresses', () => {
    for (const address of ['93.184.216.34', '198.35.26.112', '104.18.20.1', '2620:0:863:ed1a::2:b', '2606:4700::6810:1401']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses loopback, private, shared, link-local, reserved and multicast addresses, however written', () => {
    for (const address of [
      '127.0.0.1',
      '127.8.9.10',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '100.64.0.1',
      '169.254.169.254',
      '0.0.0.0',
      '192.0.2.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      '::ffff:127.0.0.1',
      '::ffff:a00:1',
      '::127.0.0.1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1%eth0',
      'ff02::1',
      '64:ff9b::7f00:1',
      '2002:7f00:1::1',
      '2001:db8::1',
      'not an address',
      '',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});

describe('fetchFromAllowedHost', () => {
  const hosts = new Set(['upload.wikimedia.org', 'media.test']);
  const lookup: Lookup = async (host) => {
    if (host === 'nowhere.test') throw new Error('ENOTFOUND');
    return [{ address: host === 'media.test' ? '104.18.20.1' : '198.35.26.112', family: 4 }];
  };
  const answering = (answers: Record<string, () => Response>) => {
    const asked: string[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      asked.push(String(input));
      expect(init?.redirect).toBe('manual');
      const answer = answers[String(input)];
      return answer ? answer() : new Response(null, { status: 404 });
    }) as typeof fetch;
    return { asked, fetchFn };
  };
  const signal = () => AbortSignal.timeout(5000);
  const refusal = async (promise: Promise<unknown>): Promise<OutboundError> => {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(OutboundError);
    return err as OutboundError;
  };

  it('fetches an https address on an allowed host, and a protocol-relative or http one at its https address', async () => {
    const { asked, fetchFn } = answering({ 'https://upload.wikimedia.org/a.ogg': () => new Response('OggS') });
    for (const address of ['https://upload.wikimedia.org/a.ogg', '//upload.wikimedia.org/a.ogg', 'http://upload.wikimedia.org/a.ogg', 'HTTPS://UPLOAD.WIKIMEDIA.ORG/a.ogg']) {
      const res = await fetchFromAllowedHost(address, { hosts, signal: signal(), fetch: fetchFn, lookup });
      expect(await res.text(), address).toBe('OggS');
    }
    expect(new Set(asked)).toEqual(new Set(['https://upload.wikimedia.org/a.ogg']));
  });

  it('refuses another host, another scheme, a port, a password or a relative address before asking anyone', async () => {
    const { asked, fetchFn } = answering({});
    for (const address of [
      'https://evil.example/a.ogg',
      'https://upload.wikimedia.org.evil.example/a.ogg',
      'https://upload.wikimedia.org:8443/a.ogg',
      'ftp://upload.wikimedia.org/a.ogg',
      'file:///etc/passwd',
      'https://user:pass@upload.wikimedia.org/a.ogg',
      '/a.ogg',
      'https://127.0.0.1/a.ogg',
    ]) {
      const err = await refusal(fetchFromAllowedHost(address, { hosts, signal: signal(), fetch: fetchFn, lookup }));
      expect(err.refused, address).toBe(true);
      expect(err.reason, address).toBe('host');
    }
    expect(asked).toEqual([]);
  });

  it('holds every redirect to the same rules, and follows at most two', async () => {
    const to = (location: string) => () => new Response(null, { status: 302, headers: { location } });
    const away = answering({ 'https://media.test/a.mp3': to('https://evil.example/a.mp3') });
    const err = await refusal(fetchFromAllowedHost('https://media.test/a.mp3', { hosts, signal: signal(), fetch: away.fetchFn, lookup }));
    expect([err.refused, err.reason]).toEqual([true, 'host']);
    expect(away.asked).toEqual(['https://media.test/a.mp3']);

    // relative to where it was sent, and on an allowed host: followed
    const near = answering({ 'https://media.test/a.mp3': to('/b.mp3'), 'https://media.test/b.mp3': () => new Response('ID3') });
    expect(await (await fetchFromAllowedHost('https://media.test/a.mp3', { hosts, signal: signal(), fetch: near.fetchFn, lookup })).text()).toBe('ID3');

    const loop = answering({
      'https://media.test/1': to('https://media.test/2'),
      'https://media.test/2': to('https://media.test/3'),
      'https://media.test/3': to('https://media.test/4'),
      'https://media.test/4': () => new Response('ID3'),
    });
    const looping = await refusal(fetchFromAllowedHost('https://media.test/1', { hosts, signal: signal(), fetch: loop.fetchFn, lookup }));
    expect([looping.refused, looping.reason]).toEqual([false, 'redirects']);
    expect(loop.asked).toHaveLength(3);
  });

  it('says what went wrong at the other end', async () => {
    const { fetchFn } = answering({ 'https://media.test/gone.mp3': () => new Response('gone', { status: 410 }) });
    const gone = await refusal(fetchFromAllowedHost('https://media.test/gone.mp3', { hosts, signal: signal(), fetch: fetchFn, lookup }));
    expect([gone.refused, gone.reason]).toEqual([false, 'status']);

    const nowhere = await refusal(
      fetchFromAllowedHost('https://nowhere.test/a', { hosts: new Set(['nowhere.test']), signal: signal(), fetch: fetchFn, lookup }),
    );
    expect([nowhere.refused, nowhere.reason]).toEqual([false, 'dns']);

    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const unreachable = await refusal(fetchFromAllowedHost('https://media.test/a', { hosts, signal: signal(), fetch: down, lookup }));
    expect([unreachable.refused, unreachable.reason]).toEqual([false, 'network']);
  });
});
