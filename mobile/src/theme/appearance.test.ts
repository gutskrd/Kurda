import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCE,
  isDarkMode,
  nextPreference,
  normalizePreference,
  PREFERENCE_LABEL,
  resolveScheme,
  THEME_PREFERENCES,
} from './appearance.js';
import { LOCALES, TRANSLATIONS } from '../i18n/translations.js';

describe('resolveScheme', () => {
  it('an explicit preference wins over the OS scheme', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('system follows the OS scheme', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('falls back to dark when the OS scheme is unknown', () => {
    // the website is dark and has no light theme, so dark is what the app is
    // when nothing has told it otherwise
    expect(resolveScheme('system', null)).toBe('dark');
  });
});

describe('isDarkMode', () => {
  it('reflects the resolved scheme', () => {
    expect(isDarkMode('dark', 'light')).toBe(true);
    expect(isDarkMode('system', 'dark')).toBe(true);
    // unknown OS scheme resolves to the default, which is dark
    expect(isDarkMode('system', null)).toBe(true);
  });
});

describe('nextPreference', () => {
  it('cycles System → Light → Dark → System', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });
});

describe('normalizePreference', () => {
  it('passes valid preferences through', () => {
    for (const p of THEME_PREFERENCES) expect(normalizePreference(p)).toBe(p);
  });

  it('falls back to the default for anything invalid', () => {
    // nothing stored, or nonsense stored, means nobody has chosen — and the
    // app before anyone chooses is the dark one the website is
    for (const bad of ['purple', undefined, null, 42]) {
      expect(normalizePreference(bad)).toBe(DEFAULT_PREFERENCE);
    }
    expect(DEFAULT_PREFERENCE).toBe('dark');
  });
});

describe('PREFERENCE_LABEL', () => {
  /**
   * Truthy was the old assertion, and a key is truthy — so it passed while the
   * map held the English words System, Light and Dark, and would pass again if
   * it held keys nothing had translated. Resolving in all nine is the claim
   * worth making.
   */
  it('gives every preference real copy in all nine languages', () => {
    for (const p of THEME_PREFERENCES) {
      const key = PREFERENCE_LABEL[p];
      for (const loc of LOCALES) {
        const copy = TRANSLATIONS[loc][key];
        expect(copy, loc + ' ' + p).toBeTruthy();
        expect(copy, loc + ' ' + p + ' reads as its own key').not.toBe(key);
      }
    }
  });
});
