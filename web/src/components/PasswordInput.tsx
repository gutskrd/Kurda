import { useState } from 'react';
import { EyeIcon } from './icons';
import { useT } from '../i18n/I18nProvider';

export function PasswordInput({
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = 'Password',
  id,
  invalid = false,
  describedBy,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  id?: string;
  /** the field's own error is showing (its id goes in `describedBy`) */
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}): React.JSX.Element {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input
        id={id}
        className="input has-affix"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="input-affix"
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}
