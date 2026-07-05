import { describe, expect, it } from 'vitest';
import { canonicalUsername } from './username.js';

const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302);

describe('canonicalUsername', () => {
  it('accepts plain latin usernames', () => {
    expect(canonicalUsername('kurda_fan')).toBe('kurda_fan');
  });

  it('accepts Kurdish letters', () => {
    expect(canonicalUsername('şêrînZarok')).toBe('şêrînZarok');
    expect(canonicalUsername('çûk_û_şev')).toBe('çûk_û_şev');
  });

  it('NFC-normalizes decomposed characters before validating', () => {
    const raw = `s${E_CIRC_DECOMPOSED}rzan`; // "sêrzan" with decomposed ê
    expect(canonicalUsername(raw)).toBe('sêrzan');
  });

  it('rejects names outside 3-30 chars', () => {
    expect(canonicalUsername('ab')).toBeNull();
    expect(canonicalUsername('a'.repeat(31))).toBeNull();
  });

  it('rejects spaces, emoji and punctuation', () => {
    expect(canonicalUsername('kur da')).toBeNull();
    expect(canonicalUsername('kurda!')).toBeNull();
    expect(canonicalUsername('kurda😀')).toBeNull();
  });

  it('trims surrounding whitespace instead of rejecting', () => {
    expect(canonicalUsername('  rojda  ')).toBe('rojda');
  });
});
