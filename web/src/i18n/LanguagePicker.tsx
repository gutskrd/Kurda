import { useId } from 'react';
import { APP_LOCALES, type AppLocale } from '@kurda/shared';
import { useT } from './I18nProvider';

/**
 * Choosing a language.
 *
 * A plain `<select>`, not a grid of flags. A flag is a country and a language
 * is not — Kurdish has no flag every Kurd would agree on, Arabic and Spanish
 * and French each have dozens, and the whole idea would put this app in the
 * business of deciding which flag stands for whom. Each option is written in
 * its own language, because somebody looking for theirs is looking for the word
 * they call it.
 */
export function LanguagePicker({
  value,
  onChange,
  disabled,
  /** shown under the field; the two places this appears say different things */
  help,
  busy,
}: {
  value: AppLocale;
  onChange: (next: AppLocale) => void;
  disabled?: boolean;
  help?: string;
  busy?: boolean;
}): React.JSX.Element {
  const t = useT();
  const id = useId();

  return (
    <div className="language-picker">
      <label className="field-label" htmlFor={id}>
        {t('language.label')}
      </label>
      <select
        id={id}
        className="input"
        value={value}
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.value as AppLocale)}
      >
        {APP_LOCALES.map((l) => (
          // `lang` on the option so a screen reader pronounces "Nederlands"
          // in Dutch rather than reading it as though it were English
          <option key={l.code} value={l.code} lang={l.code}>
            {l.nativeName}
          </option>
        ))}
      </select>
      {busy && <p className="field-hint">{t('language.saving')}</p>}
      {!busy && help && <p className="field-hint">{help}</p>}
    </div>
  );
}
