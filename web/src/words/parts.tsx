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
import type { Translate } from '../i18n/I18nProvider';

/**
 * The small parts the word sets are drawn with on tiles, cards and practice, matching mobile/src/words/parts.tsx:
 * swatches, digits, day names with their number marked in gold, and Soranî words with their Latin spelling below.
 */

/** The language tag and the direction a dialect's words are read in, whatever language the page is in. */
export const scriptLang = (dialect: AlphabetScript): string => (dialect === 'ckb' ? 'ckb' : 'ku');
export const scriptDir = (dialect: AlphabetScript): 'rtl' | 'ltr' => (dialect === 'ckb' ? 'rtl' : 'ltr');

/** A number in the reader's digits and grouping: 9,999 in English, ٩٬٩٩٩ in Arabic. */
export function formatNumber(n: number, locale: AppLocale): string {
  try {
    return n.toLocaleString(locale);
  } catch {
    return String(n);
  }
}

/** A colour swatch. Decorative, since the word beside it names the colour. */
export function Swatch({ hex, size }: { hex: string; size: number }): React.JSX.Element {
  return <span className="wd-swatch" style={{ width: size, height: size, borderRadius: size / 4, background: hex }} aria-hidden="true" />;
}

/** A number's digits: Western in Kurmancî; in Soranî its own digits with the Western ones beside them. */
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

/** A day's name with the number inside it marked, as in Yekşem, the first day after Şemî. */
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

/** A Kurdish word in its dialect, with the Latin spelling under a Soranî word. */
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
export function dateIn(at: DayOfYear, locale: AppLocale, t: Translate): string {
  const month = CALENDAR_MONTHS[at.month - 1]!;
  const name = locale === 'ku' ? month.kmr : locale === 'ckb' ? month.ckb : month.meaning[locale];
  return t('words.months.date', { day: formatNumber(at.day, locale), month: name });
}

export interface Meaning {
  text: string;
  /** The script when the text is Kurdish (a Kurdish reader sees the other dialect's word), or null in the reader's language. */
  script: AlphabetScript | null;
}

/**
 * What a word means for this reader: a number's digits, a Kurdish month's dates, else its meaning, or for a Kurdish
 * reader the same word in the other dialect.
 */
export function meaningOf(word: SetWord, dialect: AlphabetScript, locale: AppLocale, t: Translate): Meaning {
  if (word.set === 'numbers') return { text: formatNumber(word.value, locale), script: null };
  if (word.set === 'months' && word.calendar === 'kurdish') {
    return { text: t('words.months.dates', { from: dateIn(word.from, locale, t), to: dateIn(word.to, locale, t) }), script: null };
  }
  const shown = exampleMeaningLocale(dialect, locale);
  const kurdish = shown === 'ku' || shown === 'ckb';
  return { text: wordGloss(word, shown) ?? '', script: kurdish && shown !== locale ? (shown === 'ckb' ? 'ckb' : 'kmr') : null };
}

/** A meaning, in the other dialect's script and direction when it is Kurdish, else as the page runs. */
export function MeaningText({ meaning, className }: { meaning: Meaning; className?: string }): React.JSX.Element {
  const s = meaning.script;
  const cls = [className ?? '', s === 'ckb' ? 'ab-ar' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls || undefined} lang={s ? scriptLang(s) : undefined} dir={s ? scriptDir(s) : undefined}>
      {meaning.text}
    </span>
  );
}
