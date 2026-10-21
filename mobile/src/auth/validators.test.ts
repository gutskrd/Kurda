import { describe, expect, it } from 'vitest';
import { validateEmail, validatePassword, validateUsername } from './validators';

describe('validateEmail', () => {
  it('accepts normal emails and trims whitespace', () => {
    expect(validateEmail('rojda@example.com')).toBeNull();
    expect(validateEmail('  rojda@example.com  ')).toBeNull();
  });
  /*
   * The addresses an iPhone hands out: iCloud and me.com, a plus tag, Apple's
   * private relay, and capitals the keyboard or a password manager put in.
   * None of them may be turned away on the phone before the server sees them.
   */
  it('accepts iCloud, plus-tagged, private relay and capitalised addresses', () => {
    for (const address of ['name@icloud.com', 'Name.Surname+tag@me.com', 'x@privaterelay.appleid.com', 'ROJDA@ICLOUD.COM', 'a.b-c_d@mac.com']) {
      expect(validateEmail(address), address).toBeNull();
    }
  });
  it('rejects empties and malformed values', () => {
    expect(validateEmail('')).toBe('required');
    expect(validateEmail('nope')).toBe('invalid_email');
    expect(validateEmail('a@b')).toBe('invalid_email');
  });
});

describe('validatePassword', () => {
  it('accepts ≥8 chars with a letter and a number', () => {
    expect(validatePassword('abcde123')).toBeNull();
    expect(validatePassword('şêrîn123')).toBeNull(); // Kurdish letters count as letters
  });
  it('mirrors the server policy reasons', () => {
    expect(validatePassword('')).toBe('required');
    expect(validatePassword('abc123')).toBe('password_too_short');
    expect(validatePassword('12345678')).toBe('password_needs_letter');
    expect(validatePassword('abcdefgh')).toBe('password_needs_number');
  });
});

describe('validateUsername', () => {
  it('accepts Kurdish letters and NFC-normalizes first', () => {
    expect(validateUsername('şêrîn_99')).toBeNull();
    const decomposed = 's' + String.fromCharCode(0x327) + 'ev'; // ş via combining cedilla
    expect(validateUsername(decomposed)).toBeNull();
  });
  it('rejects spaces, emoji and short names', () => {
    expect(validateUsername('ab')).toBe('invalid_username');
    expect(validateUsername('has space')).toBe('invalid_username');
    expect(validateUsername('emoji😀')).toBe('invalid_username');
  });
});
