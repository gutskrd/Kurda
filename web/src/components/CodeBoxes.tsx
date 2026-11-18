import { Fragment, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

/**
 * A code typed one character per box, for joining a game (play/JoinCode.tsx) and confirming an email
 * (pages/VerifyEmail.tsx). One real text field behind the boxes does the work, so paste, autofill, input methods and
 * screen readers all meet an ordinary input; the boxes only draw it and are hidden from assistive technology. Codes read
 * left to right in every language.
 *
 * What a code may contain and what happens when it is full belong to the caller, as does the `.code-entry` around this,
 * whose classes drive the boxes (styles/play.css, styles/motion.css): `is-focused`, `is-joining`, `is-joined`, `is-error`
 * and `is-still`.
 */
export function CodeBoxes({
  value,
  length,
  fresh,
  shakes,
  inputRef,
  children,
  ...field
}: {
  /** The code's characters, already filtered from what was typed. */
  value: string;
  length: number;
  /** The first new box; boxes from here pop in one after another. */
  fresh: number;
  /** How many codes have been refused; each refusal shakes the boxes anew. */
  shakes: number;
  inputRef?: Ref<HTMLInputElement>;
  /** Drawn over the boxes, such as the flecks when a code gets you in. */
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'className' | 'children'>): React.JSX.Element {
  // The box being filled (the last once all are) shows focus; the caret shows only while there is room.
  const active = Math.min(value.length, length - 1);
  const caret = value.length < length;
  return (
    <div className="code-entry-field" dir="ltr">
      <input
        ref={inputRef}
        className="code-entry-input"
        value={value}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
        }}
        autoCorrect="off"
        spellCheck={false}
        {...field}
      />
      <span className="code-boxes" key={shakes} aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const ch = value[i];
          return (
            <Fragment key={i}>
              {length % 2 === 0 && i === length / 2 && <span className="code-boxes-gap" />}
              <span className={`code-box${ch ? ' is-filled' : ''}${i === active ? ' is-active' : ''}`} style={{ '--i': i } as CSSProperties}>
                {ch && (
                  <span key={ch} className={`code-box-char${i >= fresh ? ' is-fresh' : ''}`} style={{ '--n': Math.max(0, i - fresh) } as CSSProperties}>
                    {ch}
                  </span>
                )}
                {i === active && caret && <span className="code-box-caret" />}
              </span>
            </Fragment>
          );
        })}
      </span>
      {children}
    </div>
  );
}
