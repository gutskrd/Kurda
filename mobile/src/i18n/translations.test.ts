import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from '@kurda/shared';
import { LOCALES, LOCALE_LABEL, TRANSLATIONS } from './translations.js';

describe('translation catalogs', () => {
  const enKeys = Object.keys(TRANSLATIONS.en).sort();

  it('every locale has exactly the English key set (no gaps, no extras)', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(TRANSLATIONS[locale]).sort(), `locale ${locale}`).toEqual(enKeys);
    }
  });

  it('no locale leaves a string blank', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(TRANSLATIONS[locale])) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The dictionary is mostly imported from Wîkîferheng under CC BY-SA 4.0, and
   * naming the source and the licence is the condition of using it. The
   * sentence carries both as placeholders so each language keeps its own word
   * order; a translation that drops one renders the attribution with a hole in
   * it, in one language only, which is how a licence gets breached quietly.
   */
  it('keeps the source and the licence in the attribution, in every language', () => {
    for (const locale of LOCALES) {
      const sentence = TRANSLATIONS[locale]['dictionary.source'];
      expect(sentence, locale).toContain('{source}');
      expect(sentence, locale).toContain('{licence}');
    }
  });

  it('has a display label for every locale', () => {
    for (const locale of LOCALES) expect(LOCALE_LABEL[locale]).toBeTruthy();
  });

  /**
   * The phone offered eight languages while the browser offered nine, and
   * nothing noticed, because each kept its own list. There is one list now:
   * this asserts the phone has not started keeping a second.
   */
  it('speaks every language the shared list declares, in its own native name', () => {
    expect([...LOCALES].sort()).toEqual(APP_LOCALES.map((l) => l.code).sort());
    expect(LOCALES).toContain('es');
    for (const { code, nativeName } of APP_LOCALES) expect(LOCALE_LABEL[code]).toBe(nativeName);
  });

  /**
   * Onboarding promised "a Kurdish story every day … one a day" and no job
   * sends a story. What the server does send is a streak reminder, in the
   * account's language, on a day the streak is still waiting
   * (api/src/notifications/streak-reminder-service.ts) — so that is all the
   * slide may say, in any language.
   */
  it('promises no daily story in the notifications slide', () => {
    expect(TRANSLATIONS.en['onboarding.notify.title']).not.toMatch(/story/i);
    expect(TRANSLATIONS.en['onboarding.notify.body']).toMatch(/streak/i);
    for (const locale of LOCALES) {
      const slide = `${TRANSLATIONS[locale]['onboarding.notify.title']} ${TRANSLATIONS[locale]['onboarding.notify.body']}`;
      expect(slide, locale).not.toMatch(/story|çîrok|Geschichte|relato|öykü|قصة|récit|verhaal|چیرۆک/i);
    }
  });
});
