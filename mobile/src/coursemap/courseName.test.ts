import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../i18n/translations';
import { courseName } from './courseName';

const tIn = (locale: keyof typeof TRANSLATIONS) => (key: keyof (typeof TRANSLATIONS)['en']) => TRANSLATIONS[locale][key];

describe('a course’s name', () => {
  it('is the road’s own name in the reader’s language, never the English title on a Soranî screen', () => {
    const road = { slug: 'kurmanji-road', title: 'The Kurmanji Road' };
    expect(courseName(tIn('ckb'), road)).toBe('ڕێگای کورمانجی');
    expect(courseName(tIn('ku'), road)).toBe('Rêya Kurmancî');
    expect(courseName(tIn('en'), road)).toBe('The Kurmanji Road');
  });

  it('keeps the server’s title for any other course', () => {
    expect(courseName(tIn('ckb'), { slug: 'kurmanji-basics', title: 'Kurmanji basics' })).toBe('Kurmanji basics');
    expect(courseName(tIn('ckb'), { title: 'Untitled' })).toBe('Untitled');
  });
});
