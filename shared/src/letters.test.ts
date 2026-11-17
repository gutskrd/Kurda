import { describe, expect, it } from 'vitest';
import { LETTER_BIRDS, LETTER_MAX, LETTER_MIN, letterAgeBand, letterBirdOf, letterNoticeOf, letterProblem, letterText } from './letters.js';

const NOW = new Date(Date.UTC(2026, 10, 13));

describe('who may write to whom', () => {
  it('puts everybody in one of three bands, and nobody under 13 in any', () => {
    expect(letterAgeBand({ year: 2014, month: 1 }, NOW)).toBeNull();
    expect(letterAgeBand({ year: 2013, month: 1 }, NOW)).toBe('13-15');
    expect(letterAgeBand({ year: 2011, month: 1 }, NOW)).toBe('13-15');
    expect(letterAgeBand({ year: 2010, month: 1 }, NOW)).toBe('16-17');
    expect(letterAgeBand({ year: 2009, month: 1 }, NOW)).toBe('16-17');
    expect(letterAgeBand({ year: 2008, month: 1 }, NOW)).toBe('18+');
  });

  it('counts the birth month as the younger age, so nobody moves up a band a few days early', () => {
    // eighteen this November: still in the band below until December
    expect(letterAgeBand({ year: 2008, month: 11 }, NOW)).toBe('16-17');
    expect(letterAgeBand({ year: 2008, month: 10 }, NOW)).toBe('18+');
  });
});

describe('what a letter may hold', () => {
  const letter = 'Silav! Navê min Rojda ye û ez ji Amedê me.';

  it('takes anything from a single word up to a page, and nothing that is only spaces', () => {
    expect(letterProblem(letter)).toBeNull();
    expect(letterProblem('Silav!')).toBeNull();
    expect(LETTER_MIN).toBe(1);
    expect(letterProblem('   ')).toBe('short');
    expect(letterProblem('a'.repeat(LETTER_MAX))).toBeNull();
    expect(letterProblem('a'.repeat(LETTER_MAX + 1))).toBe('long');
  });

  it('refuses a letter of nothing but marks nobody sees, and keeps the joiners inside Soranî words', () => {
    for (const blank of ['​', '‌‌', '‏‎', '⁠ ﻿']) expect(letterProblem(blank), JSON.stringify(blank)).toBe('short');
    expect(letterProblem('سڵاو، ناوی من ڕۆژە‌یە')).toBeNull();
  });

  it('refuses a letter of characters made to look blank, and marks with no letter under them', () => {
    // Hangul fillers, the blank Braille pattern, a grapheme joiner, variation selectors and a Mongolian free variation selector
    for (const blank of ['ㅤ', 'ﾠﾠ', 'ᅟᅠ', '⠀⠀⠀', '͏', '️', '\u{E0100}', '᠋'])
      expect(letterProblem(blank), JSON.stringify(blank)).toBe('short');
    // a letter with its marks on letters, or a heart drawn with a variation selector, is still a letter
    expect(letterProblem('Silav é')).toBeNull();
    expect(letterProblem('❤️')).toBeNull();
  });

  it('refuses a link, however it is written', () => {
    for (const link of ['https://example.org/x', 'www.example', 'binêre example.com', 'EXAMPLE.NET']) expect(letterProblem(`${letter} ${link}`), link).toBe('link');
  });

  it('refuses a way to be reached somewhere else: an email, a phone number, a handle', () => {
    expect(letterProblem(`${letter} rojda@example.org`)).toBe('contact');
    expect(letterProblem(`${letter} 0612 345 678`)).toBe('contact');
    expect(letterProblem(`${letter} +964 750 123 4567`)).toBe('contact');
    // in the digits Soranî is written with too
    expect(letterProblem(`${letter} ٠٧٥٠١٢٣٤٥٦٧`)).toBe('contact');
    expect(letterProblem(`${letter} @rojda_99`)).toBe('contact');
  });

  it('lets numbers through that are not a number to call: a year, an age, two years', () => {
    expect(letterProblem('Ez di sala 2009an de hatim dinyayê û 17 salî me.')).toBeNull();
    expect(letterProblem('Ji 1995 heta 2020 em li wir man, paşê em çûn.')).toBeNull();
  });
});

describe('the birds', () => {
  it('gives everybody the same bird every time, one of the drawn colours', () => {
    const id = '48cc9c07-1111-4c2e-9a00-000000000001';
    expect(letterBirdOf(id)).toBe(letterBirdOf(id));
    const birds = new Set(Array.from({ length: 200 }, (_, i) => letterBirdOf(`user-${i}`)));
    for (const b of birds) expect(b >= 0 && b < LETTER_BIRDS.length).toBe(true);
    // over many people every colour turns up
    expect(birds.size).toBe(LETTER_BIRDS.length);
  });
});

describe('letterText', () => {
  it('keeps a letter’s lines and one empty line between paragraphs, and tidies the spaces within each line', () => {
    expect(letterText('  Hevalê delal,\r\n\r\n\r\n\rTu   çawa yî?\t \nEz baş im.  ')).toBe('Hevalê delal,\n\nTu çawa yî?\nEz baş im.');
  });

  it('composes a letter written as a letter and a mark', () => {
    expect(letterText('Ez be\u0302hna xwe vedidim.')).toBe('Ez bêhna xwe vedidim.');
  });
});

describe('a letter’s notification', () => {
  const thread = '48cc9c07-1111-4c2e-9a00-000000000002';
  const letter = '48cc9c07-1111-4c2e-9a00-000000000003';

  it('reads which correspondence, which letter, and whether it is your own bird home', () => {
    expect(letterNoticeOf({ kind: 'letter', threadId: thread, letterId: letter, how: 'home', fromUserId: 'not an id' })).toEqual({
      threadId: thread,
      how: 'home',
      letterId: letter,
      fromUserId: null,
    });
  });

  it('takes a notification from before `how` for a pen pal’s letter, and never follows an id that is not one', () => {
    expect(letterNoticeOf({ kind: 'letter', threadId: thread })).toEqual({ threadId: thread, how: 'window', letterId: null, fromUserId: null });
    expect(letterNoticeOf({ kind: 'letter', threadId: '../../settings', how: 'elsewhere' })?.threadId).toBeNull();
  });

  it('is nothing for any other notification', () => {
    expect(letterNoticeOf({ kind: 'gift', threadId: thread })).toBeNull();
    expect(letterNoticeOf(null)).toBeNull();
    expect(letterNoticeOf('letter')).toBeNull();
  });
});
