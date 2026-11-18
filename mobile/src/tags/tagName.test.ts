/**
 * Tag names in the reader's language (tagName.ts): the server's English label
 * is only the fallback for a tag the app does not know yet.
 */
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { tagBadgeText, tagName } from './tagName';

const inLocale = (locale: keyof typeof TRANSLATIONS) => (key: TranslationKey) => TRANSLATIONS[locale][key];

describe('tag names', () => {
  it('names a known tag from the app’s own catalogue, not the server’s English', () => {
    expect(tagName({ key: 'year_joined', label: 'Year Joined' }, inLocale('ar'))).toBe('سنة الانضمام');
    expect(tagBadgeText({ key: 'level', label: 'Level', value: '4' }, inLocale('ku'))).toBe('Ast: 4');
    expect(tagBadgeText({ key: 'founder', label: 'Founder', value: null }, inLocale('de'))).toBe('Gründer');
  });

  it('keeps the server’s name for a tag added to the catalogue later', () => {
    expect(tagName({ key: 'night_owl', label: 'Night owl' }, inLocale('ar'))).toBe('Night owl');
  });
});
