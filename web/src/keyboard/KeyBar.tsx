import { useT } from '../i18n/I18nProvider';

/**
 * Keys for the letters a keyboard lacks (ç ê î ş û, or the Soranî set) above a text field. A pointer press never
 * moves focus, so a phone's keyboard stays open; from the keyboard, focus returns to the field after typing.
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
  /** Shows and types capitals, because the text's next letter is one. */
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
