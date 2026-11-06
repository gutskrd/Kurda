import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password';

/* The meter under the password field: it grows with length and variety, and is weak for anything the server would refuse. */
describe('passwordStrength', () => {
  it('says nothing for an empty field', () => {
    expect(passwordStrength('')).toBe(0);
  });

  it('is weak short of the minimum, whatever is in it', () => {
    expect(passwordStrength('Ab1!')).toBe(1);
    expect(passwordStrength('abcdefg')).toBe(1);
  });

  it('grows with a number beside the letters, with length, and with a mix of cases or a symbol', () => {
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('berbang26')).toBe(2);
    expect(passwordStrength('berbang2026x')).toBe(3);
    expect(passwordStrength('Berbang2026x')).toBe(4);
    expect(passwordStrength('berbang2026!')).toBe(4);
  });

  it('never goes past the top of the meter', () => {
    expect(passwordStrength('Çiya-û-Deşt-2026-Berbang!')).toBe(4);
  });
});
