import { describe, it, expect, vi, afterEach } from 'vitest';
import { currentKeyboardKind, keyboardKind } from './device';

const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

/** A browser that answers these media queries, and says it is this one. */
function browser({ ua, matches }: { ua: string; matches: string[] }): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches.includes(query),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('keyboardKind', () => {
  it('draws a desk keyboard for a computer with a mouse or a trackpad', () => {
    expect(keyboardKind({ narrow: false, anyFinePointer: true, platform: 'windows' })).toBe('desktop');
    expect(keyboardKind({ narrow: false, anyFinePointer: true, platform: null })).toBe('desktop');
  });

  it('draws a desk keyboard for a laptop whose touch screen is its main pointer', () => {
    // the case that showed a phone's keys on a laptop: a coarse primary pointer, a desktop system
    expect(keyboardKind({ narrow: false, anyFinePointer: false, platform: 'windows' })).toBe('desktop');
    expect(keyboardKind({ narrow: false, anyFinePointer: false, platform: 'linux' })).toBe('desktop');
  });

  it('keeps the touch keys for a phone or a tablet on its own', () => {
    expect(keyboardKind({ narrow: true, anyFinePointer: false, platform: 'android' })).toBe('touch');
    expect(keyboardKind({ narrow: false, anyFinePointer: false, platform: 'ios' })).toBe('touch');
    expect(keyboardKind({ narrow: false, anyFinePointer: false, platform: null })).toBe('touch');
  });

  it('keeps the touch keys in a window too narrow for a desk row, whatever it runs on', () => {
    expect(keyboardKind({ narrow: true, anyFinePointer: true, platform: 'mac' })).toBe('touch');
  });
});

describe('currentKeyboardKind', () => {
  it('reads a desktop browser with a mouse as a desk', () => {
    browser({ ua: WINDOWS, matches: ['(any-pointer: fine)'] });
    expect(currentKeyboardKind()).toBe('desktop');
  });

  it('reads a touch laptop (coarse pointer, Windows) as a desk', () => {
    browser({ ua: WINDOWS, matches: ['(pointer: coarse)'] });
    expect(currentKeyboardKind()).toBe('desktop');
  });

  it('reads an iPad, which calls itself a Mac, as touch', () => {
    browser({ ua: IPAD, matches: ['(pointer: coarse)'] });
    expect(currentKeyboardKind()).toBe('touch');
  });

  it('reads a phone as touch', () => {
    browser({ ua: PHONE, matches: ['(pointer: coarse)', '(max-width: 640px)'] });
    expect(currentKeyboardKind()).toBe('touch');
  });
});
