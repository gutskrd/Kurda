import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCE,
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
    // The website is dark-only, so the app is dark when nothing says otherwise.
    expect(resolveScheme('system', null)).toBe('dark');
  });
});

describe('normalizePreference', () => {
  it('passes valid preferences through', () => {
    for (const p of THEME_PREFERENCES) expect(normalizePreference(p)).toBe(p);
  });

  it('falls back to the default for anything invalid', () => {
    // Nothing or nonsense stored means nobody has chosen, which means the default dark theme.
    for (const bad of ['purple', undefined, null, 42]) {
      expect(normalizePreference(bad)).toBe(DEFAULT_PREFERENCE);
    }
    expect(DEFAULT_PREFERENCE).toBe('dark');
  });
});

describe('PREFERENCE_LABEL', () => {
  // Truthiness would pass for untranslated keys too, so every preference must resolve in all nine languages.
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
