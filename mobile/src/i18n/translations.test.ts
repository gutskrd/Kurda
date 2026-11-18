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
    // what a reminder is, the slide says once, in Hevalo's bubble
    expect(TRANSLATIONS.en['guide.intro.notify.says']).toMatch(/streak/i);
    for (const locale of LOCALES) {
      const slide = `${TRANSLATIONS[locale]['onboarding.notify.title']} ${TRANSLATIONS[locale]['guide.intro.notify.says']}`;
      expect(slide, locale).not.toMatch(/story|çîrok|Geschichte|relato|öykü|قصة|récit|verhaal|چیرۆک/i);
    }
  });

  it('says the streak reminder is a note left only if wanted, turned on or off in the notifications’ own settings', () => {
    expect(TRANSLATIONS.en['guide.intro.notify.says']).toMatch(/only if you want/i);
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
      expect(TRANSLATIONS[locale]['onboarding.notify.later'], locale).toMatch(new RegExp(place[locale].slice(0, 5), 'i'));
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

/**
 * A game has one name, and it is Kurmancî (shared: games/names.ts): "Peyvok"
 * was never translated, and neither is "Xapînok". Every language shows that
 * name and says what it means beside it; the Soranî interface, which is
 * Kurdish already, names the games in its own variety.
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
 * The words round the phone's own questions: whether Hevalo may notify, and
 * whether it may use the microphone.
 *
 * To allow or not is the phone's question and the phone's word. A screen of
 * the app's own that says "Allow" before that question is read at review as
 * steering the answer, and a line after a refusal that tells somebody to
 * allow is the same push made a second time. So the app says where things
 * stand and where that is changed, and what can be done instead, in every
 * language. And what it says Hevalo sends is what the server sends.
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
   * What is pushed to a phone (api notifications/streak-reminder-service.ts,
   * letters/service.ts, badges/service.ts): a reminder on a day the streak is
   * still waiting, a letter, a badge. A message, a gift and an invite to play
   * are written to the list inside the app and never pushed, so the screen
   * before the question may not name them.
   */
  it('say what Hevalo sends before the phone asks, and nothing the server does not push', () => {
    const body = TRANSLATIONS.en['lesson.reminder.body'];
    for (const sent of [/reminder/i, /streak/i, /letter/i, /badge/i]) expect(body).toMatch(sent);
    expect(body).not.toMatch(/message|gift|invit|story|offer|news/i);
    // no reward for saying yes, and no pointing at the question's buttons
    for (const key of BEFORE) expect(TRANSLATIONS.en[key], key).not.toMatch(/tap|press|choose|free|bonus|xp|gem|unlock|don’t miss|never miss/i);
  });

  it('say, before the phone asks, that it can be changed in Settings, by the name Settings has in each language', () => {
    for (const locale of LOCALES) {
      // the stem, since Kurmancî and Turkish put an ending on the word
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
