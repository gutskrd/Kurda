import { describe, expect, it } from 'vitest';
import { CREDIT_LINES, splitCredit } from './credits';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

describe('Settings → About Hevalo credits', () => {
  it('names each licence the way it is called, in every language', () => {
    const licences = ['SIL Open Font License 1.1', 'MIT License', 'Apache License 2.0'];
    for (const locale of LOCALES) {
      CREDIT_LINES.forEach((key, i) => {
        expect(TRANSLATIONS[locale][key], `${locale} ${key}`).toContain(licences[i]);
      });
    }
  });

  it('says in every language that the shop’s art and the stickers are Hevalo’s own', () => {
    for (const locale of LOCALES) {
      expect(TRANSLATIONS[locale]['settings.credits.art'], locale).toContain('Hevalo');
      expect(TRANSLATIONS[locale]['settings.credits.title'], locale).toBeTruthy();
    }
  });

  it('sets each line as the work and, under it, its licence, whichever dash the language uses', () => {
    for (const locale of LOCALES) {
      for (const key of CREDIT_LINES) {
        const { work, licence } = splitCredit(TRANSLATIONS[locale][key]);
        expect(work.length, `${locale} ${key}`).toBeGreaterThan(0);
        expect(licence, `${locale} ${key}`).toMatch(/License/);
      }
    }
    expect(splitCredit('No licence here')).toEqual({ work: 'No licence here', licence: null });
  });
});
