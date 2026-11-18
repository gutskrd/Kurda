import { useLayoutEffect, useRef, useState } from 'react';
import { USERNAME_KURDISH_LETTERS, checkUsername, insertAtSelection, lowercaseAsTyped, usernameProblemWhileTyping } from '@kurda/shared';
import { KeyBar } from '../keyboard/KeyBar';
import { useT } from '../i18n/I18nProvider';
import { usernameRefusalText, usernameRuleText } from '../lib/usernameText';

/**
 * The username field for sign-up and username changes. It lowercases as you type, keeping the caret in place, and
 * changes nothing else: a disallowed character stays and is named under the field, and there is no maxlength, so
 * the reader is told why rather than finding a dead key. While typing it reports only what more typing cannot fix;
 * the rest shows once the field is left. The rules show from the start, with keys for the five Kurdish letters.
 *
 * `problem` is the form's or server's verdict and replaces the field's own, announced at once when `urgent`; `ok` is
 * an all-clear such as a free name.
 */
export function UsernameField({
  id,
  label,
  value,
  onChange,
  problem = null,
  ok = null,
  placeholder,
  autoFocus = false,
  disabled = false,
  urgent = false,
  className = 'field',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  problem?: string | null;
  ok?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** `problem` refuses the form just sent and is announced at once. */
  urgent?: boolean;
  /** The wrapper's class, when the form marks and shakes the field itself (auth/fieldProblem.ts). */
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  /** Where the caret belongs after the text was rewritten by lowercasing or a letter key. */
  const caret = useRef<number | null>(null);
  /** The field was left since last typed in, so every problem with the name is shown. */
  const [left, setLeft] = useState(false);

  // A controlled input whose value is rewritten moves its caret to the end; this puts it back.
  useLayoutEffect(() => {
    const at = caret.current;
    caret.current = null;
    const el = input.current;
    if (at === null || !el) return;
    if (document.activeElement !== el) el.focus();
    el.setSelectionRange(at, at);
  }, [value]);

  /** Writes the text lowercased; the caret is restored only when the rewrite moved it or `place` asks. */
  const write = (text: string, at: number, place = false): void => {
    const next = lowercaseAsTyped(text, at);
    if (place || next.text !== text || next.caret !== at) caret.current = next.caret;
    setLeft(false);
    onChange(next.text);
  };

  // A letter key inserts at the caret and moves the caret after it.
  const typeKey = (letter: string): void => {
    const el = input.current;
    const at = el ? { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length } : { start: value.length, end: value.length };
    const next = insertAtSelection(value, at, letter);
    write(next.text, next.caret, true);
  };

  const refusal = value.trim() === '' ? null : left ? checkUsername(value) : usernameProblemWhileTyping(value);
  const own = refusal && !refusal.ok ? usernameRefusalText(refusal.reason, refusal.reason === 'invalid-chars' ? refusal.chars : undefined, t) : null;
  const said = problem ?? own;
  const describedBy = [`${id}-hint`, said ? `${id}-error` : '', !said && ok ? `${id}-ok` : ''].filter(Boolean).join(' ');
  const wrapper = said && !className.split(' ').includes('has-problem') ? `${className} has-problem` : className;

  return (
    <div className={wrapper}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        ref={input}
        id={id}
        className="input"
        type="text"
        // A handle reads left to right in every language.
        dir="ltr"
        value={value}
        onChange={(e) => write(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onBlur={() => setLeft(true)}
        autoComplete="username"
        // No autocapitalising, autocorrect or spellcheck on a name.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={said ? true : undefined}
        aria-describedby={describedBy}
      />
      <div className="username-keys">
        <KeyBar keys={USERNAME_KURDISH_LETTERS} onKey={typeKey} disabled={disabled} lang="ku" dir="ltr" />
      </div>
      <span className="field-hint" id={`${id}-hint`}>
        {usernameRuleText(t)}
      </span>
      {said ? (
        <span className="field-problem" id={`${id}-error`} role={urgent && problem ? 'alert' : 'status'}>
          {said}
        </span>
      ) : ok ? (
        <span className="field-ok" id={`${id}-ok`} role="status">
          {ok}
        </span>
      ) : null}
    </div>
  );
}
