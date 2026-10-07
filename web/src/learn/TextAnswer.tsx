import { useEffect, useId, useRef, useState } from 'react';
import { insertAtSelection, typingKeys } from '@kurda/shared';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import { kurdishText } from './map';

/**
 * The letters a keyboard lacks, as buttons above the answer (KUR-037): ê î û
 * ç ş for Kurmancî, and for Soranî the letters an Arabic or Persian keyboard
 * either lacks or types as a look-alike that is a different character. A tap
 * puts the letter where the caret was and gives the caret back, so typing
 * carries straight on; a key does not take the focus from the field on a
 * pointer, and on a keyboard it is one Tab away and hands it back.
 */
function KeyBar({
  dialect,
  onKey,
  disabled,
}: {
  dialect: string | null | undefined;
  onKey: (letter: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  const t = useT();
  const { lang, dir } = kurdishText(dialect);
  return (
    <div className="lesson-keys" role="group" aria-label={t('lesson.keys.label')}>
      {typingKeys(dialect).map((letter) => (
        <button
          key={letter}
          type="button"
          className="lesson-key"
          lang={lang}
          dir={dir}
          disabled={disabled}
          aria-label={t('lesson.keys.insert', { letter })}
          // keep the caret in the field on a click
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

/**
 * A typed answer — translate, writing, and the transcription of a listening
 * item — with the key bar. Enter checks it. Once it is checked the field
 * stays, read-only, with what was typed, so the feedback below can be read
 * against it.
 */
export function TextAnswer({
  label,
  dialect,
  locked,
  busy,
  onAnswer,
}: {
  label: string;
  dialect: string | null | undefined;
  /** graded: the answer stands as typed */
  locked: boolean;
  busy: boolean;
  onAnswer: (answer: { text: string }, given: string) => void;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const caret = useRef<number | null>(null);
  const { lang, dir } = kurdishText(dialect);

  // the field is where a typed exercise starts, so the caret is put there
  useEffect(() => {
    input.current?.focus();
  }, []);

  // put the caret after a letter the key bar added, once the text has it
  useEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  const insert = (letter: string): void => {
    const el = input.current;
    const at = el ? { start: el.selectionStart ?? text.length, end: el.selectionEnd ?? text.length } : { start: text.length, end: text.length };
    const next = insertAtSelection(text, at, letter);
    caret.current = next.caret;
    setText(next.text);
  };

  return (
    <form
      className="lesson-answer"
      onSubmit={(e) => {
        e.preventDefault();
        const typed = text.trim();
        if (!locked && !busy && typed) onAnswer({ text: typed }, typed);
      }}
    >
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={input}
        className="input lesson-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked}
        lang={lang}
        dir={dir}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      <KeyBar dialect={dialect} onKey={insert} disabled={locked} />
      {!locked && (
        <Button type="submit" className="lesson-check" disabled={busy || !text.trim()}>
          {busy ? t('lesson.checking') : t('lesson.check')}
        </Button>
      )}
    </form>
  );
}
