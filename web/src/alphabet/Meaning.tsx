import { ALPHABET_MEANINGS, exampleMeaningLocale, type AlphabetMeaning, type AlphabetScript, type AppLocale } from '@kurda/shared';

/**
 * What the example word means, or for a reader who already speaks that dialect, the same word in the other one: a
 * Soranî reader gets the Kurmancî word, and the reverse.
 */
export function Meaning({ meaning, script, locale }: { meaning: AlphabetMeaning; script: AlphabetScript; locale: AppLocale }): React.JSX.Element {
  const shown = exampleMeaningLocale(script, locale);
  const other = shown !== locale;
  return (
    <span
      className={`ab-card-meaning${other && shown === 'ckb' ? ' ab-ar' : ''}`}
      lang={other ? shown : undefined}
      dir={other ? (shown === 'ckb' ? 'rtl' : 'ltr') : undefined}
    >
      {ALPHABET_MEANINGS[meaning][shown]}
    </span>
  );
}
