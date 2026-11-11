import { describe, expect, it } from 'vitest';
import { MONTH_KEYS } from './birthMonth.js';
import { TRANSLATIONS } from '../i18n/translations.js';

describe('the months offered', () => {
  it('are twelve, each with a name of its own, in every language', () => {
    expect(MONTH_KEYS).toHaveLength(12);
    for (const [locale, catalog] of Object.entries(TRANSLATIONS)) {
      const names = MONTH_KEYS.map((key) => catalog[key]);
      expect(new Set(names).size, locale).toBe(12);
    }
  });
});
