import type { AppLocale } from '@kurda/shared';
import { MEANINGS } from './letters';
import type { Script } from './practice';

/**
 * What the example word means — or, for a reader who already speaks that
 * dialect, the same word in the other one, which is the more useful thing to
 * put under it: a Soranî reader learns the Kurmancî word, and the reverse.
 */
export function Meaning({ meaning, script, locale }: { meaning: keyof typeof MEANINGS; script: Script; locale: AppLocale }): React.JSX.Element {
  const shown: AppLocale = script === 'kmr' && locale === 'ku' ? 'ckb' : script === 'ckb' && locale === 'ckb' ? 'ku' : locale;
  const other = shown !== locale;
  return (
    <span
      className={`ab-card-meaning${other && shown === 'ckb' ? ' ab-ar' : ''}`}
      lang={other ? shown : undefined}
      dir={other ? (shown === 'ckb' ? 'rtl' : 'ltr') : undefined}
    >
      {MEANINGS[meaning][shown]}
    </span>
  );
}
