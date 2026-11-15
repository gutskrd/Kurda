import { useLayoutEffect, useRef, useState } from 'react';
import { USERNAME_KURDISH_LETTERS, checkUsername, insertAtSelection, lowercaseAsTyped, usernameProblemWhileTyping } from '@kurda/shared';
import { KeyBar } from '../keyboard/KeyBar';
import { useT } from '../i18n/I18nProvider';
import { usernameRefusalText, usernameRuleText } from '../lib/usernameText';

/**
 * A username field, as signing up and changing a username both have it.
 *
 * A username is lowercase (shared/src/username.ts), so the field writes it
 * that way as it is typed: a capital comes out as its lowercase letter, Ê as
 * ê as much as H as h, with the caret left where it was. Nothing else is
 * changed, and nothing is held back. A character that cannot be in a username
 * stays in the field and is named under it ("“!” can’t be in a username"), so
 * the reader is told why rather than finding a key that does nothing; for the
 * same reason the field has no length limit of its own, and says a name is
 * too long instead of refusing the next key.
 *
 * What is said while typing is only what more typing cannot mend. "ha" is not
 * too short yet and "hamo." is on its way to "hamo.k": those are said once the
 * field is left, or by the form when it is sent (`problem`). What a username
 * may be made of is said under the field from the start, and the five Kurdish
 * letters are keys beside it for a keyboard that has none of them.
 *
 * `problem` is what the form or the server said about the name (taken, or the
 * rule it broke when sent) and is shown in place of the field's own, read out
 * at once where `urgent` (the form was just refused) and politely otherwise;
 * `ok` is an all-clear to show when nothing is wrong (a name that is free).
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
  /** `problem` is a refusal of the form just sent, to be read out at once */
  urgent?: boolean;
  /** the wrapper's class, when the form marks and shakes the field itself (auth/fieldProblem.ts) */
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  /** where the caret belongs after the field's text was rewritten: lowercased, or a key's letter put in */
  const caret = useRef<number | null>(null);
  /** the field was left since it was last typed in: everything wrong with the name is said, not only what typing cannot mend */
  const [left, setLeft] = useState(false);

  // a controlled input whose value is rewritten puts its caret at the end; this puts it back
  useLayoutEffect(() => {
    const at = caret.current;
    caret.current = null;
    const el = input.current;
    if (at === null || !el) return;
    if (document.activeElement !== el) el.focus();
    el.setSelectionRange(at, at);
  }, [value]);

  /** What was typed, lowercased; the caret is only put back when the rewrite moved it, or `place` asks for it. */
  const write = (text: string, at: number, place = false): void => {
    const next = lowercaseAsTyped(text, at);
    if (place || next.text !== text || next.caret !== at) caret.current = next.caret;
    setLeft(false);
    onChange(next.text);
  };

  // a key's letter goes in where the caret is, and the caret goes on after it, in the field
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
        // a handle reads left to right in every language
        dir="ltr"
        value={value}
        onChange={(e) => write(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onBlur={() => setLeft(true)}
        autoComplete="username"
        // a name is typed as it is meant: no capital put on it, nothing corrected, no red wave under a Kurdish word
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
