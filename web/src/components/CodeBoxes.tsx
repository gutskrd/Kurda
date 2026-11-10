import { Fragment, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

/**
 * A code typed a character to a box: the code that joins a game
 * (play/JoinCode.tsx) and the one that confirms an email address
 * (pages/VerifyEmail.tsx). A code looks and moves the same wherever Hevalo
 * asks for one.
 *
 * Behind the boxes is ONE real text field that does the work: paste, a
 * browser's offer of the code from the mail, an input method, a screen reader
 * and an Arabic-script keyboard all meet an ordinary input, and the boxes
 * only draw what it holds (they are hidden from assistive technology). The
 * boxes fill from the left, so the caret is kept after the last character. A
 * code reads left to right in every language; the words around it follow the
 * page.
 *
 * This is only the field and its drawing. What may be in a code, what
 * happens when the last box fills and what is said about it belong to
 * whoever asks for the code, and so does the `.code-entry` around this, whose
 * classes are what the boxes show (styles/play.css, styles/motion.css):
 * `is-focused` lights the box being filled, `is-joining` runs a wave along
 * them while the code is checked, `is-joined` turns them green one after
 * another, `is-error` shakes them once in red, and `is-still` leaves the
 * movement out for a device that asked for less of it.
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
  /** what the field holds: only the characters of the code, already read from what was typed */
  value: string;
  length: number;
  /** the box from which the characters are new: those pop in, one after another */
  fresh: number;
  /** how many times a code has been refused: each refusal shakes the boxes anew */
  shakes: number;
  inputRef?: Ref<HTMLInputElement>;
  /** drawn over the boxes, such as the flecks thrown when a code gets you in */
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'className' | 'children'>): React.JSX.Element {
  // the box being filled (the last one once all are), which shows where the focus is; the caret only while there is room
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
