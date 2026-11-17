import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from '@kurda/shared';
import { letterNoticeText } from './notice.js';

/** A letter's notification, as the reader's phone shows it: in the language they chose, and English for anything else. */
describe('letterNoticeText', () => {
  it('tells a pen pal’s bird from your own bird home, with the writer’s name', () => {
    expect(letterNoticeText('window', 'Baran', 'en')).toEqual({ title: 'A bird came to your window', body: 'Baran wrote you a letter.' });
    expect(letterNoticeText('home', 'Baran', 'en')).toEqual({ title: 'Your bird came home', body: 'Baran answered your letter.' });
  });

  it('speaks every language the app does, and English for any other', () => {
    for (const { code: locale } of APP_LOCALES) {
      for (const how of ['window', 'home'] as const) {
        const words = letterNoticeText(how, 'Rojda', locale);
        expect(words.title.length, `${locale} ${how}`).toBeGreaterThan(0);
        expect(words.body, `${locale} ${how}`).toContain('Rojda');
      }
    }
    expect(letterNoticeText('home', 'Rojda', 'ku').title).toBe('Balindeyê te vegeriya malê');
    expect(letterNoticeText('home', 'Rojda', 'xx')).toEqual(letterNoticeText('home', 'Rojda', 'en'));
    expect(letterNoticeText('window', 'Rojda', null)).toEqual(letterNoticeText('window', 'Rojda', 'en'));
  });
});
