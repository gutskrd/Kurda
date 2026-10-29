import { describe, expect, it } from 'vitest';
import { KURDISH_NUMBER_MAX, easternDigits, kurdishNumber, readDigits } from './number.js';

const kmr = (n: number) => kurdishNumber(n, 'kmr');
const ckb = (n: number) => kurdishNumber(n, 'ckb');
const latin = (n: number) => kurdishNumber(n, 'ckb', { latin: true });

describe('a number in Kurmancî', () => {
  it('says the units, the teens and the tens by their own words', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(kmr)).toEqual(['sifir', 'yek', 'du', 'sê', 'çar', 'pênc', 'şeş', 'heft', 'heşt', 'neh']);
    expect([10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(kmr)).toEqual([
      'deh', 'yazdeh', 'diwanzdeh', 'sêzdeh', 'çardeh', 'panzdeh', 'şanzdeh', 'hivdeh', 'hejdeh', 'nozdeh',
    ]);
    expect([20, 30, 40, 50, 60, 70, 80, 90].map(kmr)).toEqual(['bîst', 'sî', 'çil', 'pêncî', 'şêst', 'heftê', 'heştê', 'not']);
  });

  it('joins tens and ones with û', () => {
    expect(kmr(21)).toBe('bîst û yek');
    expect(kmr(35)).toBe('sî û pênc');
    expect(kmr(99)).toBe('not û neh');
  });

  it('says a hundred and a thousand without one, and the rest with their number before', () => {
    expect(kmr(100)).toBe('sed');
    expect(kmr(200)).toBe('du sed');
    expect(kmr(900)).toBe('neh sed');
    expect(kmr(1000)).toBe('hezar');
    expect(kmr(2000)).toBe('du hezar');
    expect(kmr(9000)).toBe('neh hezar');
  });

  it('joins every part to the next with û, biggest first', () => {
    expect(kmr(101)).toBe('sed û yek');
    expect(kmr(110)).toBe('sed û deh');
    expect(kmr(115)).toBe('sed û panzdeh');
    expect(kmr(120)).toBe('sed û bîst');
    expect(kmr(999)).toBe('neh sed û not û neh');
    expect(kmr(1001)).toBe('hezar û yek');
    expect(kmr(1100)).toBe('hezar û sed');
    expect(kmr(1999)).toBe('hezar û neh sed û not û neh');
    expect(kmr(2024)).toBe('du hezar û bîst û çar');
    expect(kmr(9999)).toBe('neh hezar û neh sed û not û neh');
  });
});

describe('a number in Soranî', () => {
  it('says the units, the teens and the tens by their own words', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(ckb)).toEqual(['سفر', 'یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'شەش', 'حەوت', 'هەشت', 'نۆ']);
    expect([10, 11, 12, 17, 19].map(ckb)).toEqual(['دە', 'یازدە', 'دوازدە', 'حەڤدە', 'نۆزدە']);
    expect([20, 50, 70, 90].map(ckb)).toEqual(['بیست', 'پەنجا', 'حەفتا', 'نەوەد']);
  });

  it('writes the hundreds as one word and the thousands as two', () => {
    expect(ckb(100)).toBe('سەد');
    expect(ckb(200)).toBe('دووسەد');
    expect(ckb(700)).toBe('حەوتسەد');
    expect(ckb(1000)).toBe('هەزار');
    expect(ckb(3000)).toBe('سێ هەزار');
  });

  it('joins every part to the next with و', () => {
    expect(ckb(21)).toBe('بیست و یەک');
    expect(ckb(1999)).toBe('هەزار و نۆسەد و نەوەد و نۆ');
    expect(ckb(2024)).toBe('دوو هەزار و بیست و چوار');
  });

  it('says the same in Latin letters, word for word', () => {
    expect(latin(7)).toBe('ḧewt');
    expect(latin(21)).toBe('bîst û yek');
    expect(latin(200)).toBe('dûsed');
    expect(latin(1999)).toBe('hezar û nosed û newed û no');
    for (const n of [0, 13, 58, 444, 1010, 7777, 9999]) {
      // one Latin word for every word in the script, and an û for every و
      const script = ckb(n).split(' ');
      const words = latin(n).split(' ');
      expect(words, String(n)).toHaveLength(script.length);
      script.forEach((w, i) => expect(w === 'و', `${n} ${i}`).toBe(words[i] === 'û'));
    }
  });
});

describe('the numbers it will not say', () => {
  it('refuses anything outside 0 to 9999, and fractions', () => {
    for (const n of [-1, KURDISH_NUMBER_MAX + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => kmr(n), String(n)).toThrow(RangeError);
      expect(() => ckb(n), String(n)).toThrow(RangeError);
    }
  });

  it('says every number in range, in both dialects, with no gap or doubled space', () => {
    for (let n = 0; n <= KURDISH_NUMBER_MAX; n++) {
      for (const text of [kmr(n), ckb(n), latin(n)]) {
        expect(text, String(n)).toMatch(/^\S+( \S+)*$/);
        expect(text, String(n)).not.toMatch(/undefined/);
      }
    }
  });
});

describe('the digits', () => {
  it('prints a number in the digits Soranî uses', () => {
    expect(easternDigits(0)).toBe('٠');
    expect(easternDigits(2024)).toBe('٢٠٢٤');
    expect(easternDigits(1234567890)).toBe('١٢٣٤٥٦٧٨٩٠');
  });

  it('reads back a number typed in Western, Arabic or Persian digits', () => {
    expect(readDigits('2024')).toBe(2024);
    expect(readDigits('٢٠٢٤')).toBe(2024);
    expect(readDigits('۲۰۲۴')).toBe(2024);
    expect(readDigits(' 7 ')).toBe(7);
    expect(readDigits('007')).toBe(7);
    expect(readDigits('')).toBeNull();
    expect(readDigits('12a')).toBeNull();
    expect(readDigits('-3')).toBeNull();
    expect(readDigits('1.5')).toBeNull();
  });
});
