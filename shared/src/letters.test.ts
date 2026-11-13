import { describe, expect, it } from 'vitest';
import { LETTER_BIRDS, LETTER_MAX, LETTER_MIN, letterAgeBand, letterBirdOf, letterProblem } from './letters.js';

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

  it('takes a letter of a greeting and a line, up to a page', () => {
    expect(letterProblem(letter)).toBeNull();
    expect(letterProblem('Silav!')).toBe('short');
    expect(letterProblem(`  ${'a'.repeat(LETTER_MIN - 1)}  `)).toBe('short');
    expect(letterProblem('a'.repeat(LETTER_MAX))).toBeNull();
    expect(letterProblem('a'.repeat(LETTER_MAX + 1))).toBe('long');
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
