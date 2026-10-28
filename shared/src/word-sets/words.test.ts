import { describe, expect, it } from 'vitest';
import { COMPARE_LOCALES } from '../alphabet/letters.js';
import { kurdishNumber } from './number.js';
import {
  CALENDAR_MONTHS,
  COLOURS,
  DAYS,
  KURDISH_MONTHS,
  NEWROZ,
  NUMBERS,
  RELATIVE_DAYS,
  SEASONS,
  WORD_SET_IDS,
  dayAfter,
  dayParts,
  findWord,
  glossIn,
  isWordSetId,
  kurdishWeekday,
  monthAfter,
  wordGloss,
  wordGroups,
  wordIn,
  wordSet,
  type Gloss,
  type Word,
} from './words.js';

const ARABIC_SCRIPT = /^[؀-ۿ ]+$/;
const LATIN = /^[A-Za-zÇçÊêÎîÛûŞşḦḧŁłŘř ]+$/;

function words(): Array<Word & { where: string }> {
  const out: Array<Word & { where: string }> = [];
  for (const set of WORD_SET_IDS) for (const w of wordSet(set)) out.push({ ...w, where: `${set}:${w.id}` });
  for (const c of COLOURS) out.push({ ...c.example, where: `example:${c.id}` });
  for (const [k, w] of Object.entries(RELATIVE_DAYS)) out.push({ ...w, where: `relative:${k}` });
  for (const [k, w] of Object.entries(SEASONS)) out.push({ ...w, where: `season:${k}` });
  return out;
}

function glosses(): Array<{ gloss: Gloss; where: string }> {
  return [
    ...COLOURS.flatMap((c) => [
      { gloss: c.meaning, where: c.id },
      { gloss: c.example.meaning, where: `${c.id} example` },
    ]),
    ...DAYS.map((d) => ({ gloss: d.meaning, where: d.id })),
    ...CALENDAR_MONTHS.map((m) => ({ gloss: m.meaning, where: m.id })),
    ...Object.entries(RELATIVE_DAYS).map(([k, w]) => ({ gloss: w.meaning, where: k })),
    ...Object.entries(SEASONS).map(([k, w]) => ({ gloss: w.meaning, where: k })),
  ];
}

describe('the word sets', () => {
  it('writes every word in Kurmancî, in Soranî script and in Soranî Latin', () => {
    for (const w of words()) {
      expect(w.kmr, w.where).toMatch(LATIN);
      expect(w.ckb, w.where).toMatch(ARABIC_SCRIPT);
      expect(w.ckbLatin, w.where).toMatch(LATIN);
      // as many words in the script as in its Latin letters
      expect(w.ckb.split(' ').length, w.where).toBe(w.ckbLatin.split(' ').length);
    }
  });

  it('says what each means in every other language the app speaks', () => {
    for (const { gloss, where } of glosses()) {
      expect(Object.keys(gloss).sort(), where).toEqual([...COMPARE_LOCALES].sort());
      for (const l of COMPARE_LOCALES) expect(gloss[l].trim(), `${where} ${l}`).not.toBe('');
    }
  });

  it('gives every word an id of its own in its set, and finds it by that id', () => {
    for (const set of WORD_SET_IDS) {
      const ids = wordSet(set).map((w) => w.id);
      expect(new Set(ids).size, set).toBe(ids.length);
      for (const id of ids) expect(findWord(set, id)?.id).toBe(id);
    }
    expect(findWord('colours', 'teal')).toBeUndefined();
    expect(isWordSetId('days')).toBe(true);
    expect(isWordSetId('letters')).toBe(false);
    expect(isWordSetId(undefined)).toBe(false);
  });

  it('lays out every word of a set in exactly one group', () => {
    for (const set of WORD_SET_IDS) {
      const grouped = wordGroups(set).flatMap((g) => g.words.map((w) => w.id));
      expect(grouped, set).toEqual(wordSet(set).map((w) => w.id));
    }
    expect(wordGroups('numbers').map((g) => g.id)).toEqual(['units', 'teens', 'tens', 'big']);
    expect(wordGroups('months').map((g) => g.id)).toEqual(['gregorian', 'kurdish']);
  });
});

describe('the colours', () => {
  it('has a swatch for every colour, each its own', () => {
    for (const c of COLOURS) expect(c.hex, c.id).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(COLOURS.map((c) => c.hex)).size).toBe(COLOURS.length);
  });

  /** the colour follows the word it describes, in both dialects */
  it('puts the colour word at the end of its phrase', () => {
    for (const c of COLOURS) {
      expect(c.example.kmr.endsWith(` ${c.kmr}`), c.id).toBe(true);
      expect(c.example.ckb.endsWith(` ${c.ckb}`), c.id).toBe(true);
      expect(c.example.ckbLatin.endsWith(` ${c.ckbLatin}`), c.id).toBe(true);
    }
  });

  it('says black in Soranî with the rolled r', () => {
    const black = COLOURS.find((c) => c.id === 'black')!;
    expect([black.kmr, black.ckb, black.ckbLatin]).toEqual(['reş', 'ڕەش', 'řeş']);
  });
});

describe('the numbers', () => {
  it('teaches the words every other number is made of, spelled as kurdishNumber spells them', () => {
    expect(NUMBERS.map((n) => n.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 30, 40, 50, 60, 70, 80, 90, 100, 1000]);
    for (const n of NUMBERS) {
      expect(n.kmr).toBe(kurdishNumber(n.value, 'kmr'));
      expect(n.ckb).toBe(kurdishNumber(n.value, 'ckb'));
      expect(n.id).toBe(String(n.value));
    }
    expect(NUMBERS.find((n) => n.value === 90)!.kmr).toBe('not');
  });
});

describe('the days', () => {
  it('counts the week from Saturday, with the number inside five of the names', () => {
    expect(DAYS.map((d) => d.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(DAYS.map((d) => d.kmr)).toEqual(['Şemî', 'Yekşem', 'Duşem', 'Sêşem', 'Çarşem', 'Pêncşem', 'În']);
    expect(DAYS.map((d) => d.count)).toEqual([null, 1, 2, 3, 4, 5, null]);
  });

  it('finds the number inside each counted day, in both dialects and both scripts', () => {
    for (const day of DAYS) {
      for (const dialect of ['kmr', 'ckb'] as const) {
        for (const latin of [false, true]) {
          const parts = dayParts(day, dialect, { latin });
          if (day.count === null) {
            expect(parts, day.id).toBeNull();
            continue;
          }
          expect(parts, `${day.id} ${dialect} ${latin}`).not.toBeNull();
          expect(parts!.number + parts!.rest).toBe(wordIn(day, dialect, { latin }));
          expect(parts!.number.toLocaleLowerCase('ku')).toBe(wordIn(NUMBERS[day.count]!, dialect, { latin }));
        }
      }
    }
    expect(dayParts(DAYS[2]!, 'kmr')).toEqual({ number: 'Du', rest: 'şem' });
    expect(dayParts(DAYS[1]!, 'ckb')).toEqual({ number: 'یەک', rest: 'شەممە' });
  });

  it('goes round: the day after Friday is Saturday', () => {
    expect(dayAfter(DAYS[6]!).id).toBe('sat');
    expect(dayAfter(DAYS[0]!, -1).id).toBe('fri');
    expect(dayAfter(DAYS[2]!, 2).id).toBe('wed');
  });

  it('places a date in the Kurdish week', () => {
    // 2026-10-31 is a Saturday, 2026-11-06 a Friday
    expect(kurdishWeekday(new Date(2026, 9, 31))).toBe(0);
    expect(kurdishWeekday(new Date(2026, 10, 1))).toBe(1);
    expect(kurdishWeekday(new Date(2026, 10, 6))).toBe(6);
  });
});

describe('the months', () => {
  it('has twelve on each calendar, three to a season', () => {
    for (const all of [CALENDAR_MONTHS, KURDISH_MONTHS]) {
      expect(all.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      for (const season of Object.keys(SEASONS)) expect(all.filter((m) => m.season === season), season).toHaveLength(3);
    }
    expect(CALENDAR_MONTHS.filter((m) => m.season === 'winter').map((m) => m.id)).toEqual(['jan', 'feb', 'dec']);
    expect(KURDISH_MONTHS.slice(0, 3).every((m) => m.season === 'spring')).toBe(true);
  });

  /** each Kurdish month starts the day after the one before ends, from Newroz round to Newroz */
  it('starts the Kurdish year at Newroz and leaves no day out', () => {
    expect(KURDISH_MONTHS[0]!.from).toEqual(NEWROZ);
    let days = 0;
    for (let i = 0; i < 12; i++) {
      const month = KURDISH_MONTHS[i]!;
      // the day after it ends, in a year that is not a leap year
      const after = new Date(Date.UTC(2025, month.to.month - 1, month.to.day + 1));
      expect({ month: after.getUTCMonth() + 1, day: after.getUTCDate() }, month.id).toEqual(KURDISH_MONTHS[(i + 1) % 12]!.from);
      const start = Date.UTC(2025, month.from.month - 1, month.from.day);
      days += Math.round((after.getTime() - start) / 86_400_000 + (after.getTime() < start ? 365 : 0));
    }
    expect(days).toBe(365);
  });

  it('goes round on its own calendar', () => {
    expect(monthAfter(CALENDAR_MONTHS[11]!).id).toBe('jan');
    expect(monthAfter(KURDISH_MONTHS[11]!).id).toBe('xakelewe');
    expect(monthAfter(KURDISH_MONTHS[0]!).id).toBe('gulan');
  });
});

describe('what a word means', () => {
  const red = COLOURS[0]!;
  it('is the word in the language of the reader, or for a Kurdish reader the word in that dialect', () => {
    expect(wordGloss(red, 'de')).toBe('rot');
    expect(wordGloss(red, 'ku')).toBe('sor');
    expect(wordGloss(red, 'ckb')).toBe('سوور');
    expect(glossIn(red.example, 'fr')).toBe('une rose rouge');
    expect(glossIn(RELATIVE_DAYS.today, 'ku')).toBe('îro');
  });

  it('is the digits of a number, and nothing for a Kurdish month, whose dates the page says', () => {
    expect(wordGloss(NUMBERS[7]!, 'en')).toBe('7');
    expect(wordGloss(KURDISH_MONTHS[0]!, 'en')).toBeNull();
    expect(wordGloss(CALENDAR_MONTHS[2]!, 'tr')).toBe('Mart');
  });
});
