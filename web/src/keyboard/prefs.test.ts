import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_KEYBOARD_PREFS,
  KEYBOARD_PREFS_KEY,
  getKeyboardPrefs,
  parseKeyboardPrefs,
  resetKeyboardPrefsForTests,
  updateKeyboardPrefs,
} from './prefs';

beforeEach(() => resetKeyboardPrefsForTests());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('keyboard settings, per device', () => {
  it('start forgiving, with the letter keys and the backtick shortcut on', () => {
    expect(getKeyboardPrefs()).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(DEFAULT_KEYBOARD_PREFS).toMatchObject({ accentMode: 'forgiving', keyBar: true, backtick: true, wordleLayout: 'qwerty' });
  });

  it('keep the fields that make sense and default the rest, one at a time', () => {
    expect(parseKeyboardPrefs('not json')).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(parseKeyboardPrefs('[1,2]')).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(
      parseKeyboardPrefs(JSON.stringify({ accentMode: 'loose', keyBar: false, wordleLayout: 'alphabet', raceDialect: 'sorani', guideNudgeDismissedAt: 'x' })),
    ).toEqual({ ...DEFAULT_KEYBOARD_PREFS, keyBar: false, wordleLayout: 'alphabet', raceDialect: 'sorani' });
  });

  it('remember a change on this device', () => {
    updateKeyboardPrefs({ accentMode: 'strict' });
    expect(JSON.parse(localStorage.getItem(KEYBOARD_PREFS_KEY)!).accentMode).toBe('strict');
    resetKeyboardPrefsForTests();
    expect(getKeyboardPrefs().accentMode).toBe('strict');
  });

  it('still work for this visit where storage refuses', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getKeyboardPrefs()).toEqual(DEFAULT_KEYBOARD_PREFS);
    updateKeyboardPrefs({ backtick: false });
    expect(getKeyboardPrefs().backtick).toBe(false);
  });
});
