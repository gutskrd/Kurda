/**
 * Any number from 0 to 9999, spelled out in Kurmancî and in Soranî.
 *
 * Both say a number the same way, biggest part first, each part joined to the
 * next by "and" — û in Kurmancî, و in Soranî: 21 is bîst û yek / بیست و یەک,
 * 1999 is hezar û neh sed û not û neh / هەزار و نۆسەد و نەوەد و نۆ. A round
 * hundred or thousand is the number word before sed or hezar, with "one" left
 * out: sed, du sed; hezar, du hezar. Soranî writes its hundreds as one word
 * (دووسەد) and its thousands as two (دوو هەزار).
 *
 * Every word here is listed for a native speaker to check before it is relied on.
 */

export type NumberDialect = 'kmr' | 'ckb';

interface Words {
  units: readonly string[];
  /** ten to nineteen */
  teens: readonly string[];
  /** twenty to ninety, by their tens digit */
  tens: readonly string[];
  hundred: string;
  thousand: string;
  and: string;
  /** a hundred times the unit, as the dialect writes it */
  hundreds: (unit: string) => string;
}

const KMR: Words = {
  units: ['sifir', 'yek', 'du', 'sê', 'çar', 'pênc', 'şeş', 'heft', 'heşt', 'neh'],
  teens: ['deh', 'yazdeh', 'diwanzdeh', 'sêzdeh', 'çardeh', 'panzdeh', 'şanzdeh', 'hivdeh', 'hejdeh', 'nozdeh'],
  tens: ['', '', 'bîst', 'sî', 'çil', 'pêncî', 'şêst', 'heftê', 'heştê', 'not'],
  hundred: 'sed',
  thousand: 'hezar',
  and: 'û',
  hundreds: (unit) => `${unit} sed`,
};

const CKB: Words = {
  units: ['سفر', 'یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'شەش', 'حەوت', 'هەشت', 'نۆ'],
  teens: ['دە', 'یازدە', 'دوازدە', 'سێزدە', 'چواردە', 'پازدە', 'شازدە', 'حەڤدە', 'هەژدە', 'نۆزدە'],
  tens: ['', '', 'بیست', 'سی', 'چل', 'پەنجا', 'شەست', 'حەفتا', 'هەشتا', 'نەوەد'],
  hundred: 'سەد',
  thousand: 'هەزار',
  and: 'و',
  hundreds: (unit) => `${unit}سەد`,
};

/** Soranî in Latin letters, letter for letter with the script above. */
const CKB_LATIN: Words = {
  units: ['sifir', 'yek', 'dû', 'sê', 'çwar', 'pênc', 'şeş', 'ḧewt', 'heşt', 'no'],
  teens: ['de', 'yazde', 'dwazde', 'sêzde', 'çwarde', 'pazde', 'şazde', 'ḧevde', 'hejde', 'nozde'],
  tens: ['', '', 'bîst', 'sî', 'çil', 'penca', 'şest', 'ḧefta', 'heşta', 'newed'],
  hundred: 'sed',
  thousand: 'hezar',
  and: 'û',
  hundreds: (unit) => `${unit}sed`,
};

/** The largest number spelled. */
export const KURDISH_NUMBER_MAX = 9999;

/**
 * `n` in words: Kurmancî, or Soranî in its own script — or, with `latin`,
 * Soranî in Latin letters. Throws a RangeError outside 0–9999 or for a
 * fraction, which the caller is expected to have ruled out.
 */
export function kurdishNumber(n: number, dialect: NumberDialect, { latin = false }: { latin?: boolean } = {}): string {
  if (!Number.isInteger(n) || n < 0 || n > KURDISH_NUMBER_MAX) throw new RangeError(`no Kurdish words for ${n} here: 0 to ${KURDISH_NUMBER_MAX} only`);
  const w = dialect === 'kmr' ? KMR : latin ? CKB_LATIN : CKB;
  if (n === 0) return w.units[0]!;
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (thousands) parts.push(thousands === 1 ? w.thousand : `${w.units[thousands]} ${w.thousand}`);
  if (hundreds) parts.push(hundreds === 1 ? w.hundred : w.hundreds(w.units[hundreds]!));
  if (rest) parts.push(underHundred(rest, w));
  return parts.join(` ${w.and} `);
}

function underHundred(n: number, w: Words): string {
  if (n < 10) return w.units[n]!;
  if (n < 20) return w.teens[n - 10]!;
  const ones = n % 10;
  const tens = w.tens[Math.floor(n / 10)]!;
  return ones ? `${tens} ${w.and} ${w.units[ones]}` : tens;
}

const EASTERN = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

/** A whole number in the digits Soranî is printed in: 2024 → ٢٠٢٤. */
export function easternDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => EASTERN[Number(d)]!);
}

/**
 * The number somebody typed, in whichever digits their keyboard has —
 * Western, Arabic or Persian — or null when it is not a whole number.
 */
export function readDigits(text: string): number | null {
  const western = text.trim().replace(/[٠-٩۰-۹]/g, (d) => String(Math.max(EASTERN.indexOf(d), PERSIAN.indexOf(d))));
  return /^[0-9]+$/.test(western) ? Number(western) : null;
}
