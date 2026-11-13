import { useEffect, useRef, type ReactNode } from 'react';
import { SendIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * The message box, shared by the direct and group threads.
 *
 * It was a single-line input, so a message could not contain a line break at all
 * — pressing Enter submitted and there was no other way to get one. It is now a
 * textarea that grows with its content.
 *
 * What Enter does follows what is under the hand. At a keyboard, Enter sends
 * (what everyone expects in a chat) and Shift+Enter starts a new line. On a
 * touch screen there is no Shift to hold, so Enter is the new line, as it is
 * in every chat on a phone, and Send is the button beside the box; the key
 * itself says which (`enterKeyHint`).
 *
 * The box does not wait on the server: the thread shows a message the moment
 * it is sent (chat/useOutbox.ts), so Send is ready again at once.
 *
 * The field and its Send are one rounded shape: the words on the left, a
 * round button at the end of them that lights up in the colour of the
 * reader's own bubbles once there is something to send. It was a boxed input
 * beside a wide button reading "Send", which on a phone left the words less
 * than half the row.
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
  /**
   * Buttons before the box — the gift button (gifts/useChatGifts), the game
   * button (play/PlayButtons), and whatever else a thread offers. Kept
   * outside the form's own controls so pressing one never submits the message.
   */
  tools?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const touch = useMediaQuery(TOUCH);

  // Re-measure on every change: reset to auto first, or the height only ever
  // grows because scrollHeight can never report less than the current height.
  // The field is border-box, so its height is the text and padding that
  // scrollHeight measures plus the border round them; without the border every
  // line past the first was 2px short, and a scrollbar showed up for nothing.
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
