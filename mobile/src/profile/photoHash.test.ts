import { describe, expect, it } from 'vitest';
import { base64ToBytes, sha256Hex } from './photoHash';

describe('base64ToBytes', () => {
  it('decodes base64 to the exact bytes', () => {
    expect([...base64ToBytes('aGVsbG8=')]).toEqual([104, 101, 108, 108, 111]); // "hello"
    expect([...base64ToBytes('YWJj')]).toEqual([97, 98, 99]); // "abc"
    expect([...base64ToBytes('')]).toEqual([]);
  });

  it('round-trips arbitrary bytes (length preserved)', () => {
    // 3 bytes with padding variations
    expect(base64ToBytes('AAAA').length).toBe(3); // 000000
    expect(base64ToBytes('AA==').length).toBe(1);
    expect(base64ToBytes('AAA=').length).toBe(2);
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 of "abc"', () => {
    expect(sha256Hex(base64ToBytes('YWJj'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the known SHA-256 of the empty input', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
