import { describe, expect, it } from 'vitest';
import { applyEdit, capTyping, deleteBack, deleteWordBack, isBlockedKey, typeAtEnd, typingCap } from './input';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  ...mods,
});

describe('the race field takes typing at its end only', () => {
  it('refuses every key that moves the caret or selects', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter']) {
      expect(isBlockedKey(key(k)), k).toBe(true);
    }
    expect(isBlockedKey(key('a', { ctrlKey: true }))).toBe(true);
    expect(isBlockedKey(key('A', { metaKey: true }))).toBe(true);
    expect(isBlockedKey(key('z', { ctrlKey: true }))).toBe(true);
  });

  it('lets letters, Backspace and Tab through — and AltGr letters, which are Ctrl+Alt on Windows', () => {
    for (const k of ['a', 'ê', ' ', 'Backspace', 'Tab', 'Shift']) expect(isBlockedKey(key(k)), k).toBe(false);
    expect(isBlockedKey(key('a', { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('leaves an input method alone while it composes', () => {
    expect(isBlockedKey(key('ArrowDown', { isComposing: true }))).toBe(false);
  });

  it('deletes back by a whole letter, never half of one', () => {
    expect(deleteBack('ez bêm')).toBe('ez bê');
    expect(deleteBack('😀')).toBe('');
    expect(deleteBack('')).toBe('');
  });

  it('deletes back a word with the spaces after it', () => {
    expect(deleteWordBack('ez ji welat')).toBe('ez ji ');
    expect(deleteWordBack('ez ji ')).toBe('ez ');
    expect(deleteWordBack('ez')).toBe('');
  });

  it('types at the end, a line break as a space, and e then ` as ê when the shortcut is on', () => {
    expect(typeAtEnd('ez b', 'e', true)).toBe('ez be');
    expect(typeAtEnd('ez be', '`', true)).toBe('ez bê');
    expect(typeAtEnd('ez be', '`', false)).toBe('ez be`');
    expect(typeAtEnd('ez', '\n', true)).toBe('ez ');
  });

  it('reads an edit by its kind, and refuses what is not typing', () => {
    expect(applyEdit('ez', 'insertText', ' ji', true)).toBe('ez ji');
    expect(applyEdit('ez ji', 'deleteContentBackward', null, true)).toBe('ez j');
    expect(applyEdit('ez ji', 'deleteWordBackward', null, true)).toBe('ez ');
    expect(applyEdit('ez ji', 'deleteContentForward', null, true)).toBeNull();
    expect(applyEdit('ez ji', 'insertFromPaste', 'welat', true)).toBeNull();
    expect(applyEdit('ez ji', 'insertReplacementText', 'welat', true)).toBeNull();
  });

  it('leaves room past the end of the text for letters typed twice, but not without limit', () => {
    expect(typingCap(10)).toBe(34);
    expect(typingCap(400)).toBe(500);
    expect([...capTyping('x'.repeat(100), 10)]).toHaveLength(34);
    expect(capTyping('ez', 10)).toBe('ez');
  });
});
