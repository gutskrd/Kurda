import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { memoryStore } from './deviceStore';
import { DEFAULT_KEYBOARD_PREFS, KEYBOARD_PREFS_KEY, KeyboardPrefsStore, parseKeyboardPrefs } from './prefs';

describe('parseKeyboardPrefs', () => {
  it('starts forgiving, with the key bar and the backtick shortcut on', () => {
    expect(parseKeyboardPrefs(null)).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(DEFAULT_KEYBOARD_PREFS).toMatchObject({ accentMode: 'forgiving', keyBar: true, backtick: true, wordleLayout: 'qwerty' });
  });

  it('keeps what it recognises and defaults the rest, one field at a time', () => {
    const prefs = parseKeyboardPrefs(
      JSON.stringify({ accentMode: 'strict', keyBar: 'yes', backtick: false, wordleLayout: 'dvorak', raceDialect: 'sorani' }),
    );
    expect(prefs).toEqual({
      accentMode: 'strict',
      keyBar: true,
      backtick: false,
      wordleLayout: 'qwerty',
      raceDialect: 'sorani',
      guideShown: false,
    });
  });

  it('survives garbage', () => {
    expect(parseKeyboardPrefs('{not json')).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(parseKeyboardPrefs('42')).toEqual(DEFAULT_KEYBOARD_PREFS);
  });
});

describe('KeyboardPrefsStore', () => {
  it('reads the saved settings once and tells everyone listening', async () => {
    const store = memoryStore({ [KEYBOARD_PREFS_KEY]: JSON.stringify({ accentMode: 'hidden' }) });
    const prefs = new KeyboardPrefsStore(store);
    const heard = vi.fn();
    prefs.subscribe(heard);
    await prefs.load();
    expect(prefs.current.accentMode).toBe('hidden');
    expect(prefs.ready).toBe(true);
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ accentMode: 'hidden' }));
  });

  it('saves a change on the device, whole', async () => {
    const store = memoryStore();
    const prefs = new KeyboardPrefsStore(store);
    prefs.update({ keyBar: false, wordleLayout: 'alphabet' });
    await Promise.resolve();
    expect(JSON.parse(store.data.get(KEYBOARD_PREFS_KEY)!)).toMatchObject({ keyBar: false, wordleLayout: 'alphabet', accentMode: 'forgiving' });
  });

  it('does not let a slow first read undo a change made meanwhile', async () => {
    let release: (v: string | null) => void = () => undefined;
    const store = {
      ...memoryStore(),
      get: () => new Promise<string | null>((r) => (release = r)),
    };
    const prefs = new KeyboardPrefsStore(store);
    const loading = prefs.load();
    prefs.update({ accentMode: 'strict' });
    release(JSON.stringify({ accentMode: 'hidden' }));
    await loading;
    expect(prefs.current.accentMode).toBe('strict');
  });
});
