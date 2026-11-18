import { useEffect, useRef, type ReactNode } from 'react';
import { SendIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * The message box shared by the direct and group threads: a textarea that grows with its content, joined with a round
 * Send button that lights up once there is something to send. With a keyboard Enter sends and Shift+Enter adds a line;
 * on a touch screen Enter adds a line and the button sends (`enterKeyHint` says which). The thread shows a message as
 * soon as it is sent (chat/useOutbox.ts), so Send never waits on the server.
 */

/** Grow to this many lines, then scroll — past that it eats the thread. */
const MAX_ROWS = 5;

/** A finger is the main pointer: there is no Shift+Enter to be had. */
const TOUCH = '(pointer: coarse)';

export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxLength = 2000,
  tools,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  maxLength?: number;
  /** Buttons before the box, such as gifts and games, kept outside the form so pressing one never submits it. */
  tools?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const touch = useMediaQuery(TOUCH);

  // Reset to auto before measuring, or scrollHeight never reports less than the current height. The field is
  // border-box, so the border is added to scrollHeight or each extra line is 2px short and shows a scrollbar.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 20;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, line * MAX_ROWS + padding + border)}px`;
  }, [value]);

  const empty = value.trim().length === 0;

  return (
    <form
      className="chat-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) onSubmit();
      }}
    >
      {tools && <div className="chat-compose-tools">{tools}</div>}
      <div className="chat-compose-field">
        <textarea
          ref={ref}
          className="chat-compose-input"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // at a keyboard Enter sends and Shift+Enter (or a composing IME) writes a new line; on a touch screen Enter is the new line
            if (touch) return;
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!empty) onSubmit();
            }
          }}
          enterKeyHint={touch ? 'enter' : 'send'}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={t('chat.message')}
        />
        <button type="submit" className="chat-send" disabled={empty} aria-label={t('chat.send')} title={t('chat.send')}>
          <SendIcon size={18} />
        </button>
      </div>
    </form>
  );
}
