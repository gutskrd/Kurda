import { useEffect, useRef, useState } from 'react';
import { dialectDirection, type GameDialect } from '@kurda/shared';
import { Button } from '../components/Button';
import { useTypeOnly } from '../components/typeOnly';
import { useT } from '../i18n/I18nProvider';
import type { ApiError, ApiResult } from '../lib/types';

/**
 * The box a clue or a guess is typed into, in a party game: in the game's
 * Kurdish (its language and direction), typed rather than pasted, with the
 * slip the box can see said before it is sent (the wrong letters, too long,
 * the word itself), and the server's refusal said after (the chat
 * pipeline's, or the game's). Sent with Enter or the button; cleared once
 * the move is taken.
 */
export function PartyComposer({
  id,
  label,
  placeholder,
  sendLabel,
  dialect,
  maxLength,
  slip,
  onSend,
  errorOf,
  autoFocus = true,
  disabled = false,
}: {
  id: string;
  label: string;
  placeholder: string;
  sendLabel: string;
  dialect: GameDialect;
  maxLength: number;
  /** what the box can see is wrong with the text, in the reader's words; null when nothing */
  slip: (text: string) => string | null;
  onSend: (text: string) => Promise<ApiResult<unknown>>;
  errorOf: (error: ApiError) => string;
  autoFocus?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { handlers: typeOnly, notice: pasteNotice } = useTypeOnly(t('games.rhyme.noPasting'));
  const script = dialectDirection(dialect);
  const hint = text.trim() ? slip(text) : null;
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!text.trim() || hint || busy || disabled) return;
    setBusy(true);
    setError(null);
    const res = await onSend(text);
    setBusy(false);
    if (res.ok) {
      setText('');
      input.current?.focus();
    } else setError(errorOf(res.error));
  }

  const note = pasteNotice ?? error ?? hint;
  return (
    <form className="party-compose" onSubmit={send}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        ref={input}
        className="input party-input"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder={placeholder}
        lang={script.lang}
        dir={script.dir}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={hint ? true : undefined}
        aria-describedby={note ? `${id}-hint` : undefined}
        {...typeOnly}
      />
      {/* busy, it keeps its word and its width: an ellipsis in its place shrank the button and said nothing */}
      <Button type="submit" disabled={busy || disabled || !text.trim() || hint !== null} aria-busy={busy || undefined}>
        {sendLabel}
      </Button>
      {note && (
        <p id={`${id}-hint`} className="party-hint" role="status">
          {note}
        </p>
      )}
    </form>
  );
}
