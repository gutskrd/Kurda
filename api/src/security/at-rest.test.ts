import { describe, expect, it } from 'vitest';
import { seal, unseal } from './at-rest.js';

const SECRET = 'a-server-secret-of-at-least-32-characters';

describe('sealing a secret at rest', () => {
  it('reads back what it sealed, and never stores it in the clear', () => {
    const sealed = seal(SECRET, 'purpose-a', 'r.refresh-token-ŞÊÎ');
    expect(sealed).not.toContain('refresh-token');
    expect(sealed.split('.')).toHaveLength(4);
    expect(unseal(SECRET, 'purpose-a', sealed)).toBe('r.refresh-token-ŞÊÎ');
  });

  it('seals the same value differently each time', () => {
    expect(seal(SECRET, 'purpose-a', 'same')).not.toBe(seal(SECRET, 'purpose-a', 'same'));
  });

  it('answers null under another secret or for another purpose', () => {
    const sealed = seal(SECRET, 'purpose-a', 'token');
    expect(unseal('another-server-secret-of-32-characters!', 'purpose-a', sealed)).toBeNull();
    expect(unseal(SECRET, 'purpose-b', sealed)).toBeNull();
  });

  it('answers null for a value that was altered, or was never sealed', () => {
    const [version, nonce, tag, body] = seal(SECRET, 'purpose-a', 'token').split('.') as [string, string, string, string];
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    expect(unseal(SECRET, 'purpose-a', [version, nonce, tag, flipped.toString('base64url')].join('.'))).toBeNull();
    expect(unseal(SECRET, 'purpose-a', [version, nonce, tag.slice(0, 8), body].join('.'))).toBeNull();
    expect(unseal(SECRET, 'purpose-a', 'token')).toBeNull();
    expect(unseal(SECRET, 'purpose-a', `v2.${nonce}.${tag}.${body}`)).toBeNull();
  });
});
