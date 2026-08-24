import { useState } from 'react';
import { EyeIcon } from './icons';

export function PasswordInput({
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = 'Password',
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  id?: string;
}): React.JSX.Element {
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
      />
      <button
        type="button"
        className="input-affix"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}
