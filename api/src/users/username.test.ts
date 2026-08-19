import { describe, expect, it } from 'vitest';
import { canonicalUsername, validateUsername, type UsernameError } from './username.js';
import { foldForReserved, isReservedUsername } from './reserved-usernames.js';

const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302);
const reasonOf = (raw: string): UsernameError | 'ok' => {
  const r = validateUsername(raw);
  return r.ok ? 'ok' : r.reason;
};

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

describe('validateUsername (structural rules)', () => {
  it('accepts a normal username', () => {
    expect(validateUsername('rojda_kurdi')).toEqual({ ok: true, value: 'rojda_kurdi' });
  });

  it('reports a specific reason per rule', () => {
    expect(reasonOf('ab')).toBe('too-short');
    expect(reasonOf('a'.repeat(31))).toBe('too-long');
    expect(reasonOf('kur da')).toBe('invalid-chars'); // internal whitespace
    expect(reasonOf('kurda!')).toBe('invalid-chars');
    expect(reasonOf('kurda😀')).toBe('invalid-chars');
    expect(reasonOf('_rojda')).toBe('edge-underscore');
    expect(reasonOf('rojda_')).toBe('edge-underscore');
    expect(reasonOf('roj__da')).toBe('consecutive-underscore');
    expect(reasonOf('12345')).toBe('numbers-only');
    expect(reasonOf('12_34')).toBe('no-letter'); // digits + underscore, no letter
  });

  it('rejects control characters and unusual unicode', () => {
    expect(reasonOf('roj' + String.fromCharCode(0) + 'da')).toBe('invalid-chars'); // NUL
    expect(reasonOf('roj' + String.fromCharCode(0x200b) + 'da')).toBe('invalid-chars'); // zero-width space
    expect(reasonOf('r' + String.fromCharCode(0x043e) + 'jda')).toBe('invalid-chars'); // Cyrillic 'о'
  });

  it('rejects reserved names and their look-alikes', () => {
    expect(reasonOf('admin')).toBe('reserved');
    expect(reasonOf('MyKurda')).toBe('reserved');
    expect(reasonOf('official')).toBe('reserved');
    expect(reasonOf('adm1n')).toBe('reserved'); // leet confusable
    expect(reasonOf('my_kurda')).toBe('reserved'); // separator stripped
    expect(reasonOf('0fficial')).toBe('reserved');
    // a normal name that merely contains a reserved substring is fine
    expect(reasonOf('adminakurdi')).toBe('ok');
    expect(reasonOf('kurda_fan')).toBe('ok');
  });
});

describe('reserved-usernames folding', () => {
  it('folds case, diacritics, separators and confusables', () => {
    expect(foldForReserved('My_Kûrda')).toBe('mykurda');
    expect(foldForReserved('Adm1n')).toBe('admin');
  });

  it('flags reserved names and clears normal ones', () => {
    expect(isReservedUsername('system')).toBe(true);
    expect(isReservedUsername('SUPPORT')).toBe(true);
    expect(isReservedUsername('rojda')).toBe(false);
    expect(isReservedUsername('kurda_fan')).toBe(false);
  });
});
