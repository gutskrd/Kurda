import { describe, expect, it } from 'vitest';
import {
  LETTER_BIRDS,
  LETTER_MAX,
  LETTER_MIN,
  freshLetters,
  letterAgeBand,
  letterBirdOf,
  letterNoticeOf,
  letterProblem,
  letterText,
  letterThreadPath,
  withEarlierLetters,
  type LetterItem,
  type LetterThread,
} from './letters.js';

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

describe('a correspondence a page at a time', () => {
  const letter = (n: number): LetterItem => ({ id: `l${n}`, mine: n % 2 === 0, body: `Name ${n}`, decor: null, removed: false, sentAt: '', readAt: null });
  const thread = (from: number, to: number, earlier?: boolean): LetterThread => ({
    threadId: 't1',
    person: { id: 'p', name: 'Rojda', bird: 1 },
    letters: Array.from({ length: to - from + 1 }, (_, i) => letter(from + i)),
    yourTurn: false,
    closed: false,
    ...(earlier === undefined ? {} : { earlier }),
  });
  const ids = (t: LetterThread) => t.letters.map((l) => l.id);

  it('asks for the newest page, or the page before a letter', () => {
    expect(letterThreadPath('t 1')).toBe('/letters/threads/t%201?limit=10');
    expect(letterThreadPath('t1', 'l5')).toBe('/letters/threads/t1?before=l5&limit=10');
  });

  it('puts earlier letters before those shown, once each, with whether more remain', () => {
    const shown = withEarlierLetters(thread(11, 20, true), thread(1, 11, false));
    expect(ids(shown)).toEqual(ids(thread(1, 20)));
    expect(shown.earlier).toBe(false);
  });

  it('keeps the earlier letters shown when the newest are read again, with a new one among them', () => {
    const shown = withEarlierLetters(thread(11, 20, true), thread(1, 10, false));
    const again = freshLetters(shown, { ...thread(12, 21, true), yourTurn: true });
    expect(ids(again)).toEqual(ids(thread(1, 21)));
    expect(again).toMatchObject({ earlier: false, yourTurn: true });
    // the newest page alone: its first letter stays when a new one pushes it off the fresh page
    const moved = freshLetters(thread(11, 20, true), thread(12, 21, true));
    expect(ids(moved)).toEqual(ids(thread(11, 21)));
    expect(moved.earlier).toBe(true);
  });

  it('takes a fresh read as it is when nothing is shown yet, when the two would not meet, or from a server without pages', () => {
    expect(freshLetters(null, thread(11, 20, true))).toEqual(thread(11, 20, true));
    expect(ids(freshLetters(thread(1, 10, false), thread(31, 40, true)))).toEqual(ids(thread(31, 40)));
    expect(freshLetters(thread(5, 10, true), thread(1, 12))).toEqual(thread(1, 12));
  });
});
