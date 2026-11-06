import { describe, expect, it } from 'vitest';
import { APP_LOCALES, STORY_LEVELS, levelHintKey, levelNameKey } from '@kurda/shared';
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
   *
   * And it says where the reminder lands: in the notifications inside the
   * app. That stays true with push: the reminder reaches the phone only once
   * the phone allows it, which the slide does not ask for (the app asks after
   * a lesson, or from Settings). Reminders are on by default for adults and
   * off for minors, so the slide says they can be turned on or off, not only
   * on — and where: Settings → Notification settings, by the names those two
   * screens have in each language. It said "in Profile", where there is no
   * such switch.
   */
  it('promises no daily story in the notifications slide', () => {
    expect(TRANSLATIONS.en['onboarding.notify.title']).not.toMatch(/story/i);
    expect(TRANSLATIONS.en['onboarding.notify.body']).toMatch(/streak/i);
    for (const locale of LOCALES) {
      const slide = `${TRANSLATIONS[locale]['onboarding.notify.title']} ${TRANSLATIONS[locale]['onboarding.notify.body']}`;
      expect(slide, locale).not.toMatch(/story|çîrok|Geschichte|relato|öykü|قصة|récit|verhaal|چیرۆک/i);
    }
  });

  it('says the streak reminder is left in the app’s notifications, and can be turned on or off', () => {
    expect(TRANSLATIONS.en['onboarding.notify.body']).toMatch(/leaves you a reminder in your notifications/i);
    expect(TRANSLATIONS.en['onboarding.notify.body']).not.toMatch(/can remind you/i);
    expect(TRANSLATIONS.en['onboarding.notify.later']).toMatch(/on or off/i);
    // every language names the place, in the word its Notifications screen uses
    const place: Record<(typeof LOCALES)[number], string> = {
      en: 'notifications',
      ku: 'agahdari',
      ckb: 'ئاگادارکردنەوە',
      ar: 'إشعارات',
      tr: 'bildirim',
      de: 'Mitteilungen',
      fr: 'notifications',
      es: 'notificaciones',
      nl: 'meldingen',
    };
    for (const locale of LOCALES) {
      expect(TRANSLATIONS[locale]['notifications.title'], locale).toMatch(new RegExp(place[locale].slice(0, 5), 'i'));
      expect(TRANSLATIONS[locale]['onboarding.notify.body'], locale).toContain(place[locale]);
      expect(TRANSLATIONS[locale]['onboarding.notify.later'], locale).toContain(TRANSLATIONS[locale]['settings.title']);
      expect(TRANSLATIONS[locale]['onboarding.notify.later'], locale).toContain(TRANSLATIONS[locale]['settings.notifications']);
    }
  });

  it('names the currencies on the leaderboards as the shop does, so a board never reads as a third currency', () => {
    for (const locale of LOCALES) {
      const c = TRANSLATIONS[locale];
      expect(c['rankings.board.zer'], locale).toBe('Zêr');
      expect(c['rankings.board.zerBlurb'], locale).toContain('Zêr');
      // the shop says where gems come from in the same word the board ranks them by
      expect(c['shop.earnMoreGems'].toLocaleLowerCase(locale), locale).toContain(c['rankings.board.gewher'].toLocaleLowerCase(locale));
    }
    expect(TRANSLATIONS.ku['rankings.board.gewher']).toBe('Gewher');
    expect(TRANSLATIONS.ckb['rankings.board.gewher']).toBe('گەوهەر');
  });

  /**
   * A level is shown by a plain name wherever it appears (`levelNameKey`):
   * five different names, each with a line saying what reading at it is like,
   * and never the bare CEFR letter. The website's catalogue is held to the
   * same names, so the two apps read as one ladder — the fourth level was
   * spelled two ways in Kurmancî before.
   */
  it('names the five levels plainly, each differently, and never by a CEFR letter', () => {
    for (const locale of LOCALES) {
      const names = STORY_LEVELS.map((l) => TRANSLATIONS[locale][levelNameKey(l)]);
      const hints = STORY_LEVELS.map((l) => TRANSLATIONS[locale][levelHintKey(l)]);
      expect(new Set(names).size, locale).toBe(5);
      expect(new Set(hints).size, locale).toBe(5);
      for (const text of [...names, ...hints]) expect(text, locale).not.toMatch(/\b[ABC][12]\b/);
    }
    expect(STORY_LEVELS.map((l) => TRANSLATIONS.en[levelNameKey(l)])).toEqual(['Starter', 'Beginner', 'Intermediate', 'Confident', 'Advanced']);
    expect(STORY_LEVELS.map((l) => TRANSLATIONS.ku[levelNameKey(l)])).toEqual(['Destpêk', 'Bingehîn', 'Navîn', 'Jêhatî', 'Pêşketî']);
  });
});
