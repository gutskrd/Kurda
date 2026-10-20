import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

/**
 * The message box, shared by the direct and group threads.
 *
 * It was a single-line input, so a message could not contain a line break at all
 * — pressing Enter submitted and there was no other way to get one. It is now a
 * textarea that grows with its content: Enter sends (what everyone expects in a
 * chat) and Shift+Enter starts a new line.
 */

/** Grow to this many lines, then scroll — past that it eats the thread. */
const MAX_ROWS = 5;

export function Composer({
  value,
  onChange,
  onSubmit,
  sending,
  placeholder,
  maxLength = 2000,
  tools,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  sending: boolean;
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
        if (!empty && !sending) onSubmit();
      }}
    >
      {tools && <div className="chat-compose-tools">{tools}</div>}
      <textarea
        ref={ref}
        className="input chat-compose-input"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter (or a composing IME) writes a newline
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!empty && !sending) onSubmit();
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={t('chat.message')}
      />
      <Button type="submit" disabled={sending || empty}>
        {sending ? t('chat.sending') : t('chat.send')}
      </Button>
    </form>
  );
}
