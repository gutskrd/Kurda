import { afterEach, describe, expect, it } from 'vitest';
import { PROVERB_THEMES, RIDDLE_CATEGORIES, RIDDLE_DIFFICULTIES, type RiddleCard } from '@kurda/shared';
import { TRANSLATIONS } from '../i18n/translations';
import { CATEGORY_KEY, DIFFICULTY_KEY, THEME_KEY, besideName, collectionName, defaultLoreDialect, dialectOfSlug, inReaderLanguage, textIn, traditionMark } from './labels';
import { mergeHints, nextRiddle, rememberAnswer, rememberedAnswer, resetLoreStore } from './store';

const t = (key: keyof typeof TRANSLATIONS.en, vars?: Record<string, string | number>): string =>
  TRANSLATIONS.en[key].replace(/\{(\w+)\}/g, (_, v: string) => String(vars?.[v] ?? ''));

const card = (slug: string, state: RiddleCard['state']): RiddleCard => ({
  slug,
  dialect: 'kmr',
  difficulty: 'easy',
  category: 'nature',
  tradition: 'traditional',
  region: null,
  question: slug,
  translations: {},
  hintCount: 1,
  state,
});

afterEach(resetLoreStore);

describe('the collections’ words', () => {
  it('names every difficulty, category and theme the shared lists have, in every language', () => {
    for (const catalogue of Object.values(TRANSLATIONS)) {
      for (const d of RIDDLE_DIFFICULTIES) expect(catalogue[DIFFICULTY_KEY[d]]).toBeTruthy();
      for (const c of RIDDLE_CATEGORIES) expect(catalogue[CATEGORY_KEY[c]]).toBeTruthy();
      for (const th of PROVERB_THEMES) expect(catalogue[THEME_KEY[th]]).toBeTruthy();
    }
    // Twelve themes, twelve different names in each language.
    for (const catalogue of Object.values(TRANSLATIONS)) expect(new Set(PROVERB_THEMES.map((th) => catalogue[THEME_KEY[th]])).size).toBe(12);
  });

  it('puts the reader’s word beside the Kurmancî name, and nothing where the two are the same', () => {
    expect(besideName('Metelok', TRANSLATIONS.en['lore.riddles.name'])).toBe('Riddles');
    expect(besideName('Metelok', TRANSLATIONS.ku['lore.riddles.name'])).toBeNull();
    expect(besideName('Gotinên pêşiyan', TRANSLATIONS.ku['lore.proverbs.name'])).toBeNull();
    expect(besideName('Metelok', TRANSLATIONS.ckb['lore.riddles.name'])).toBe('مەتەڵ');
  });

  it('names a collection in Soranî for a Soranî reader, as the website does, and in Kurmancî for everyone else', () => {
    expect(collectionName('Metelok', TRANSLATIONS.ckb['lore.riddles.name'], 'ckb')).toEqual({ name: 'مەتەڵ', beside: null, lang: 'ckb' });
    expect(collectionName('Gotinên pêşiyan', TRANSLATIONS.ckb['lore.proverbs.name'], 'ckb').name).toBe(TRANSLATIONS.ckb['lore.proverbs.name']);
    expect(collectionName('Metelok', TRANSLATIONS.en['lore.riddles.name'], 'en')).toEqual({ name: 'Metelok', beside: 'Riddles', lang: 'ku' });
    expect(collectionName('Metelok', TRANSLATIONS.ar['lore.riddles.name'], 'ar').name).toBe('Metelok');
  });

  it('never calls a newly written one old, and names a regional one’s region', () => {
    expect(traditionMark('new', null, t)).toBe('Newly written');
    expect(traditionMark('regional', 'Behdînan', t)).toBe('Behdînan');
    expect(traditionMark('traditional', null, t)).toBe('Traditional');
  });

  it('shows the reader’s translation, else the English one, else nothing', () => {
    const translations = { en: { question: 'What is it?' }, de: { question: 'Was ist das?' } };
    expect(inReaderLanguage(translations, 'de')).toEqual({ value: { question: 'Was ist das?' }, lang: 'de' });
    expect(inReaderLanguage(translations, 'fr')).toEqual({ value: { question: 'What is it?' }, lang: 'en' });
    expect(inReaderLanguage({}, 'fr')).toBeNull();
  });

  it('sets a translation in its own direction, whatever the interface', () => {
    expect(textIn('ar').style).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    expect(textIn('en').style).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
    expect(textIn('ckb').props.accessibilityLanguage).toBe('ckb');
  });

  it('reads the variety off a slug, and opens on Soranî in a Soranî interface', () => {
    expect(dialectOfSlug('ckb-ba')).toBe('ckb');
    expect(dialectOfSlug('kmr-ba')).toBe('kmr');
    expect(defaultLoreDialect('ckb', 'kmr')).toBe('ckb');
    expect(defaultLoreDialect('en', 'ckb')).toBe('ckb');
    expect(defaultLoreDialect('de', 'kmr')).toBe('kmr');
  });
});

describe('what the riddle screens hand each other', () => {
  it('offers the next riddle not yet solved or seen, going round to the start', () => {
    const list = [card('a', 'solved'), card('b', 'new'), card('c', 'revealed'), card('d', 'trying')];
    expect(nextRiddle(list, 'b')?.slug).toBe('d');
    expect(nextRiddle(list, 'd')?.slug).toBe('b');
    expect(nextRiddle(list, 'zz')?.slug).toBe('b');
    expect(nextRiddle([card('a', 'solved'), card('b', 'revealed')], 'a')).toBeNull();
  });

  it('keeps each hint once, in order, from the server and from this phone', () => {
    const h = (index: number) => ({ index, text: `h${index}`, translations: {} });
    expect(mergeHints('a', [h(1)]).map((x) => x.index)).toEqual([1]);
    expect(mergeHints('a', [h(0), h(1)]).map((x) => x.index)).toEqual([0, 1]);
    expect(mergeHints('a', []).map((x) => x.index)).toEqual([0, 1]);
  });

  it('does not undo a solve by looking at the answer again', () => {
    const answer = { answer: 'sî', explanation: 'x', translations: {}, tradition: 'traditional' as const, region: null, sources: [] };
    rememberAnswer('a', answer, true, 3);
    rememberAnswer('a', answer, false);
    expect(rememberedAnswer('a')).toMatchObject({ solved: true, xp: 3 });
  });
});
