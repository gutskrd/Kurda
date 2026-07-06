import { describe, expect, it } from 'vitest';
import { validateEmail, validatePassword, validateUsername } from './validators';

describe('validateEmail', () => {
  it('accepts normal emails and trims whitespace', () => {
    expect(validateEmail('rojda@example.com')).toBeNull();
    expect(validateEmail('  rojda@example.com  ')).toBeNull();
  });
  it('rejects empties and malformed values', () => {
    expect(validateEmail('')).toBe('required');
    expect(validateEmail('nope')).toBe('invalid_email');
    expect(validateEmail('a@b')).toBe('invalid_email');
  });
});

describe('validatePassword', () => {
  it('mirrors the server minimum of 8', () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('1234567')).toBe('password_too_short');
    expect(validatePassword('')).toBe('required');
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
