import { describe, expect, it } from 'vitest';
import { validatePassword, PASSWORD_MAX } from './password-policy.js';

describe('validatePassword', () => {
  it('accepts a password with a letter and a number at the minimum length', () => {
    expect(validatePassword('abcde123')).toEqual({ ok: true });
  });

  it('accepts letters + digits mixed with symbols', () => {
    expect(validatePassword('Str0ng-Pass!')).toEqual({ ok: true });
  });

  it('accepts non-ASCII (Kurdish) letters as letters', () => {
    expect(validatePassword('şêrîn123')).toEqual({ ok: true });
  });

  it('rejects too-short', () => {
    expect(validatePassword('ab12')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('rejects too-long', () => {
    expect(validatePassword('a1'.repeat(PASSWORD_MAX))).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects a password with no letter', () => {
    expect(validatePassword('12345678')).toEqual({ ok: false, reason: 'needs-letter' });
  });

  it('rejects a password with no number', () => {
    expect(validatePassword('abcdefgh')).toEqual({ ok: false, reason: 'needs-number' });
  });

  it('checks length before composition', () => {
    // too short AND missing a number → the length reason wins
    expect(validatePassword('abc')).toEqual({ ok: false, reason: 'too-short' });
  });
});
