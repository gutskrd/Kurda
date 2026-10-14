import { useT } from '../i18n/I18nProvider';

/**
 * The letters a keyboard lacks, as keys above where you type: ç ê î ş û for a
 * Kurmancî text, the Soranî set for a Soranî one.
 *
 * A key types without taking the focus from the field: on a pointer the press
 * is not allowed to move focus at all (so a phone's keyboard stays open and
 * the caret stays put), and from the keyboard — one Tab away — the field gets
 * the focus back after the letter is typed.
 */
export function KeyBar({
  keys,
  onKey,
  disabled,
  upper = false,
  lang,
  dir,
}: {
  keys: readonly string[];
  onKey: (letter: string) => void;
  disabled?: boolean;
  /** show (and type) capitals — the text's next letter is a capital */
  upper?: boolean;
  lang: 'ku' | 'ckb';
  dir: 'ltr' | 'rtl';
}): React.JSX.Element {
  const t = useT();
  return (
    <div className="key-bar" role="group" aria-label={t('lesson.keys.label')} dir={dir}>
      {keys.map((k) => {
        const letter = upper ? k.toUpperCase() : k;
        return (
          <button
            key={k}
            type="button"
            className="key-bar-key"
            lang={lang}
            disabled={disabled}
            aria-label={t('lesson.keys.insert', { letter })}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onKey(letter)}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
