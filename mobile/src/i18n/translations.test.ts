import { describe, expect, it } from 'vitest';
import { APP_LOCALES, GAME_NAMES, STORY_LEVELS, levelHintKey, levelNameKey } from '@kurda/shared';
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
   * The dictionary is mostly from Wîkîferheng under CC BY-SA 4.0, which requires naming the source and the
   * licence. The sentence carries both as placeholders so each language keeps its word order; a translation
   * dropping one would silently breach the licence in that language.
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

  /** The phone and the web app share one list of languages; this asserts the phone does not keep a second. */
  it('speaks every language the shared list declares, in its own native name', () => {
    expect([...LOCALES].sort()).toEqual(APP_LOCALES.map((l) => l.code).sort());
    expect(LOCALES).toContain('es');
    for (const { code, nativeName } of APP_LOCALES) expect(LOCALE_LABEL[code]).toBe(nativeName);
  });

  /**
   * The onboarding notification slide may describe only what the server sends: a streak reminder, in the
   * account's language, on a day the streak is still waiting (api/src/notifications/streak-reminder-service.ts),
   * delivered to the in-app notifications. Reminders are on by default for adults and off for minors, so the
   * slide says they can be turned on or off, and where: Settings → Notification settings, by those screens' names
   * in each language.
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
    // Every language names the place, in the word its Notifications screen uses.
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
      // The shop says where gems come from in the same word the board ranks them by.
      expect(c['shop.earnMoreGems'].toLocaleLowerCase(locale), locale).toContain(c['rankings.board.gewher'].toLocaleLowerCase(locale));
    }
    expect(TRANSLATIONS.ku['rankings.board.gewher']).toBe('Gewher');
    expect(TRANSLATIONS.ckb['rankings.board.gewher']).toBe('گەوهەر');
  });

  /**
   * A level is always shown by its plain name (`levelNameKey`), five distinct names each with a line on what
   * reading at it is like, never the bare CEFR letter. The web catalogue uses the same names, so both apps show
   * one ladder.
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

/**
 * A game has one name, in Kurmancî (shared games/names.ts): "Peyvok" and "Xapînok" are never translated. Every
 * language shows the name with its meaning beside it; the Soranî interface names the games in its own variety.
 */
describe('the games’ names', () => {
  const NAME_KEY = {
    'wordle-battle': 'games.battle.name',
    rhyme: 'games.rhyme.name',
    'rhyme-match': 'games.rhymeMatch.name',
    race: 'games.race.name',
    'memory-thief': 'games.memory.name',
    detective: 'games.detective.name',
    'last-letter': 'games.lastLetter.name',
    impostor: 'games.impostor.name',
    'who-am-i': 'games.whoAmI.name',
  } as const;
  const MEANING_KEYS = ['games.battle', 'games.rhyme', 'games.rhymeMatch', 'games.race', 'games.memory', 'games.detective', 'games.lastLetter', 'games.impostor', 'games.whoAmI'] as const;

  it('are Kurmancî in every language but Soranî, which has its own', () => {
    for (const locale of LOCALES) {
      for (const [game, key] of Object.entries(NAME_KEY) as Array<[keyof typeof NAME_KEY, (typeof NAME_KEY)[keyof typeof NAME_KEY]]>) {
        if (locale === 'ckb') expect(TRANSLATIONS[locale][key], `${locale} ${key}`).not.toBe(GAME_NAMES[game]);
        else expect(TRANSLATIONS[locale][key], `${locale} ${key}`).toBe(GAME_NAMES[game]);
      }
    }
  });

  it('come with what they mean in the reader’s language, which only a Kurdish interface has no need of', () => {
    for (const locale of LOCALES) {
      for (const stem of MEANING_KEYS) {
        const [name, meaning] = [TRANSLATIONS[locale][`${stem}.name`], TRANSLATIONS[locale][`${stem}.meaning`]];
        if (locale === 'ku' || locale === 'ckb') expect(meaning, `${locale} ${stem}`).toBe(name);
        else expect(meaning, `${locale} ${stem}`).not.toBe(name);
      }
    }
  });

  it('never say that a game is Kurdish: every game here is', () => {
    const kurdish = /kurd|koerd|kürt|كرد|کورد/i;
    for (const locale of LOCALES) {
      for (const key of [...Object.values(NAME_KEY), 'games.wordle.name', 'games.sentence.name', 'games.hear.name', ...MEANING_KEYS.map((stem) => `${stem}.meaning` as const)] as const) {
        expect(TRANSLATIONS[locale][key], `${locale} ${key}`).not.toMatch(kurdish);
      }
    }
  });
});

/*
 * The text around the phone's own permission questions (notifications, microphone). Allowing is the system
 * prompt's choice: an app screen saying "Allow" before it is read at review as steering the answer, and a
 * post-refusal line telling people to allow is the same pressure again. So the app says where things stand, where
 * to change them and what else can be done, in every language, and describes only what the server actually sends.
 */
describe('the words round the phone’s own questions', () => {
  /** "Allow", in the stem each language's own prompt and the app's older lines used. */
  const ALLOW: Record<(typeof LOCALES)[number], RegExp> = {
    en: /allow/i,
    ku: /destûr/i,
    ckb: /ڕێگە/,
    de: /erlaub/i,
    es: /perm[ií]t|permiso/i,
    tr: /izin/i,
    ar: /سماح|اسمح|يسمح/,
    fr: /autoris/i,
    nl: /toesta|toegesta|\bsta\b[^.]*\btoe\b/i,
  };
  const BEFORE = ['lesson.reminder.title', 'lesson.reminder.body', 'lesson.reminder.note'] as const;
  const AFTER = [
    'lesson.speak.micOff',
    'recorder.micNeeded',
    'recorder.micHelp',
    'practice.hub.micOff',
    'learn.reminders.line',
    'notifications.device.notAsked',
    'notifications.device.off',
    'notifications.device.openSettings',
  ] as const;

  it('never say "allow", before the question or after a refusal, in any language', () => {
    for (const locale of LOCALES) {
      for (const key of [...BEFORE, ...AFTER]) expect(TRANSLATIONS[locale][key], `${locale} ${key}`).not.toMatch(ALLOW[locale]);
    }
  });

  /*
   * What is pushed to a phone (api notifications/streak-reminder-service.ts, letters/service.ts,
   * badges/service.ts): a streak reminder, a letter, a badge. Messages, gifts and game invites go only to the
   * in-app list, so the pre-prompt screen may not name them.
   */
  it('say what Hevalo sends before the phone asks, and nothing the server does not push', () => {
    const body = TRANSLATIONS.en['lesson.reminder.body'];
    for (const sent of [/reminder/i, /streak/i, /letter/i, /badge/i]) expect(body).toMatch(sent);
    expect(body).not.toMatch(/message|gift|invit|story|offer|news/i);
    // No reward for saying yes, and no pointing at the question's buttons.
    for (const key of BEFORE) expect(TRANSLATIONS.en[key], key).not.toMatch(/tap|press|choose|free|bonus|xp|gem|unlock|don’t miss|never miss/i);
  });

  it('say, before the phone asks, that it can be changed in Settings, by the name Settings has in each language', () => {
    for (const locale of LOCALES) {
      // The stem, since Kurmancî and Turkish put an ending on the word.
      const settings = TRANSLATIONS[locale]['settings.title'].slice(0, 6);
      expect(TRANSLATIONS[locale]['lesson.reminder.note'], locale).toContain(settings);
    }
  });

  it('say after a refused microphone that it is off for Hevalo, where it is turned on, and what can be done instead', () => {
    const off = 'The microphone is off for Hevalo.';
    expect(TRANSLATIONS.en['lesson.speak.micOff']).toBe(`${off} You can turn it on in your device settings, or skip this one.`);
    expect(TRANSLATIONS.en['recorder.micHelp']).toBe(`${off} You can turn it on in your phone’s settings, or write a comment instead.`);
    for (const locale of LOCALES) {
      for (const key of ['lesson.speak.micOff', 'recorder.micHelp', 'practice.hub.micOff'] as const) {
        expect(TRANSLATIONS[locale][key], `${locale} ${key}`).toContain('Hevalo');
      }
    }
  });
});
