import { describe, expect, it } from 'vitest';
import { VERIFICATION_CODE_LENGTH, codeDigits } from './pending-signup.js';

describe('the digits of a confirmation code', () => {
  it('are kept as they are typed, one at a time, and never more than six', () => {
    expect(codeDigits('')).toBe('');
    expect(codeDigits('4')).toBe('4');
    expect(codeDigits('4829')).toBe('4829');
    expect(codeDigits('4829137')).toBe('482913');
    expect(codeDigits('482913')).toHaveLength(VERIFICATION_CODE_LENGTH);
  });

  it('leave out whatever is not a digit', () => {
    expect(codeDigits('48a2')).toBe('482');
    expect(codeDigits('482 913')).toBe('482913');
    expect(codeDigits('482-913')).toBe('482913');
    expect(codeDigits(' 482913\n')).toBe('482913');
  });

  it('read the digits an Arabic or a Soranî keyboard types', () => {
    expect(codeDigits('٤٨٢٩١٣')).toBe('482913');
    expect(codeDigits('۴۸۲۹۱۳')).toBe('482913');
    expect(codeDigits('48٢')).toBe('482');
  });

  it('find the code in the sentence it was copied with', () => {
    expect(codeDigits('Your Hevalo code is 482913. It lasts 15 minutes.')).toBe('482913');
    expect(codeDigits('15 minutes left: 482913')).toBe('482913');
  });

  it('take a shorter code when one is asked for', () => {
    expect(codeDigits('12345', 4)).toBe('1234');
  });
});
