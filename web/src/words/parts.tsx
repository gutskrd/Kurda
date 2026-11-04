import {
  CALENDAR_MONTHS,
  dayParts,
  easternDigits,
  exampleMeaningLocale,
  wordGloss,
  wordIn,
  type AlphabetScript,
  type AppLocale,
  type DayOfYear,
  type KurdishWord,
  type SetWord,
  type WordDay,
} from '@kurda/shared';
import type { useT } from '../i18n/I18nProvider';

/**
 * The small parts the word sets are drawn with, on their tiles, their card
 * and their practice alike — the website's copy of the phone's
 * (mobile/src/words/parts.tsx): a colour's swatch, a number's digits
 * (Soranî's own beside the Western ones), a day's name with the number inside
 * it marked in gold — the colour the alphabet keeps for "notice this" — and a
 * word with its Soranî Latin under the script, the bridge for a reader of the
 * other alphabet.
 */

type T = ReturnType<typeof useT>;

/** The language tag and the direction a dialect's words are read in, whatever language the page is in. */
export const scriptLang = (dialect: AlphabetScript): string => (dialect === 'ckb' ? 'ckb' : 'ku');
export const scriptDir = (dialect: AlphabetScript): 'rtl' | 'ltr' => (dialect === 'ckb' ? 'rtl' : 'ltr');

/** A number in the reader's own digits and grouping: 9,999 for an English reader, ٩٬٩٩٩ for an Arabic one. */
export function formatNumber(n: number, locale: AppLocale): string {
  try {
    return n.toLocaleString(locale);
  } catch {
    return String(n);
  }
}

/** A colour, as a swatch. Decorative: the word beside it says which. */
export function Swatch({ hex, size }: { hex: string; size: number }): React.JSX.Element {
  return <span className="wd-swatch" style={{ width: size, height: size, borderRadius: size / 4, background: hex }} aria-hidden="true" />;
}

/** A number's digits: the Western ones in Kurmancî; in Soranî the ones it is printed in, with the Western ones beside them. */
export function Digits({ value, dialect, size }: { value: number; dialect: AlphabetScript; size: 'tile' | 'card' | 'option' | 'prompt' }): React.JSX.Element {
  const western = String(value);
  if (dialect === 'kmr') {
    return (
      <span className={`wd-digits wd-digits--${size}`} dir="ltr">
        {western}
      </span>
    );
  }
  return (
    <span className={`wd-digits wd-digits--${size}`} dir="rtl" lang="ckb">
      {easternDigits(value)}
      <small dir="ltr">{western}</small>
    </span>
  );
}

/** A day's name with the number inside it marked: Yekşem, the first after Şemî. */
export function DayName({ day, dialect, className }: { day: WordDay; dialect: AlphabetScript; className?: string }): React.JSX.Element {
  const parts = dayParts(day, dialect);
  const cls = [className ?? '', dialect === 'ckb' ? 'ab-ar' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls || undefined} lang={scriptLang(dialect)} dir={scriptDir(dialect)}>
      {parts ? (
        <>
          <mark>{parts.number}</mark>
          {parts.rest}
        </>
      ) : (
        wordIn(day, dialect)
      )}
    </span>
  );
}

/**
 * A Kurdish word in its dialect, and for Soranî the same word in Latin
 * letters under it — the bridge for a reader of the other script.
 */
export function WordText({
  word,
  dialect,
  className,
  latin = true,
}: {
  word: KurdishWord;
  dialect: AlphabetScript;
  className?: string;
  latin?: boolean;
}): React.JSX.Element {
  return (
    <span className={`wd-word${className ? ` ${className}` : ''}`}>
      <span className={`wd-word-text${dialect === 'ckb' ? ' ab-ar' : ''}`} lang={scriptLang(dialect)} dir={scriptDir(dialect)}>
        {wordIn(word, dialect)}
      </span>
      {dialect === 'ckb' && latin && (
        <span className="wd-latin" lang="ku" dir="ltr">
          {word.ckbLatin}
        </span>
      )}
    </span>
  );
}

/** A day of the year in the reader's words: "21 March", "21. März", "٢١ی ئازار". */
export function dateIn(at: DayOfYear, locale: AppLocale, t: T): string {
  const month = CALENDAR_MONTHS[at.month - 1]!;
  const name = locale === 'ku' ? month.kmr : locale === 'ckb' ? month.ckb : month.meaning[locale];
  return t('words.months.date', { day: formatNumber(at.day, locale), month: name });
}

export interface Meaning {
  text: string;
  /** the script the text is in when it is Kurdish (a Kurdish reader is shown the other dialect's word); null in the reader's own language */
  script: AlphabetScript | null;
}

/**
 * What a word means for this reader: a number's digits, a Kurdish month's
 * dates, else its meaning — or, for a reader of one dialect, the same word
 * in the other, which is the more useful thing to put under it.
 */
export function meaningOf(word: SetWord, dialect: AlphabetScript, locale: AppLocale, t: T): Meaning {
  if (word.set === 'numbers') return { text: formatNumber(word.value, locale), script: null };
  if (word.set === 'months' && word.calendar === 'kurdish') {
    return { text: t('words.months.dates', { from: dateIn(word.from, locale, t), to: dateIn(word.to, locale, t) }), script: null };
  }
  const shown = exampleMeaningLocale(dialect, locale);
  const kurdish = shown === 'ku' || shown === 'ckb';
  return { text: wordGloss(word, shown) ?? '', script: kurdish && shown !== locale ? (shown === 'ckb' ? 'ckb' : 'kmr') : null };
}

/** A meaning drawn: in the other dialect's script and direction when it is Kurdish, else as the page runs. */
export function MeaningText({ meaning, className }: { meaning: Meaning; className?: string }): React.JSX.Element {
  const s = meaning.script;
  const cls = [className ?? '', s === 'ckb' ? 'ab-ar' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls || undefined} lang={s ? scriptLang(s) : undefined} dir={s ? scriptDir(s) : undefined}>
      {meaning.text}
    </span>
  );
}
