import { describe, expect, it } from 'vitest';
import { applyTypingChange, looksPasted, typeKey } from './input';

describe('applyTypingChange', () => {
  it('takes a letter typed at the end', () => {
    expect(applyTypingChange('ez', 'ez ')).toEqual({ typed: 'ez ', pasted: false });
  });

  it('takes a backspace at the end', () => {
    expect(applyTypingChange('ez j', 'ez ').typed).toBe('ez ');
  });

  it('reads a letter typed with the cursor moved into the middle as the next letter', () => {
    // the "clicks up" bug: the caret was moved to offset 3 and ê typed there
    expect(applyTypingChange('ez ji welat', 'ez êji welat').typed).toBe('ez ji welatê');
  });

  it('reads a backspace in the middle as taking the last letter', () => {
    expect(applyTypingChange('ez ji welat', 'ez i welat').typed).toBe('ez ji wela');
  });

  it('keeps a word a keyboard put in at once (glide typing, a suggestion)', () => {
    expect(applyTypingChange('ez ', 'ez dixwazim ').typed).toBe('ez dixwazim ');
    // a suggestion replacing the word being typed
    expect(applyTypingChange('ez dix', 'ez dixwazim').typed).toBe('ez dixwazim');
  });

  it('refuses a paste of more than a word, and keeps the typing as it was', () => {
    expect(applyTypingChange('ez', 'ez ji welatê xwe')).toEqual({ typed: 'ez', pasted: true });
    expect(applyTypingChange('', 'a'.repeat(25))).toEqual({ typed: '', pasted: true });
    expect(looksPasted('welat')).toBe(false);
    expect(looksPasted(' welat ')).toBe(false);
    expect(looksPasted('ji welat')).toBe(true);
  });

  it('turns e then a backtick into ê when the shortcut is on, and not when it is off', () => {
    expect(applyTypingChange('we', 'we`', { backtick: true }).typed).toBe('wê');
    expect(applyTypingChange('we', 'we`', { backtick: false }).typed).toBe('we`');
    // a backtick after a letter without an accented form is itself
    expect(applyTypingChange('wa', 'wa`', { backtick: true }).typed).toBe('wa`');
  });

  it('never grows past the limit', () => {
    expect(applyTypingChange('abc', 'abcd', { maxLength: 3 }).typed).toBe('abc');
  });

  it('never splits an emoji when it cuts', () => {
    expect(applyTypingChange('ab', 'ab😀', { maxLength: 3 }).typed).toBe('ab');
  });

  it('is a no-op when nothing changed', () => {
    expect(applyTypingChange('ez', 'ez')).toEqual({ typed: 'ez', pasted: false });
  });
});

describe('typeKey', () => {
  it('types a key-bar letter at the end', () => {
    expect(typeKey('w', 'ê')).toBe('wê');
  });
});
