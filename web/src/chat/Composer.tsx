import { useEffect, useRef } from 'react';
import { Button } from '../components/Button';

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
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  sending: boolean;
  placeholder: string;
  maxLength?: number;
}): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-measure on every change: reset to auto first, or the height only ever
  // grows because scrollHeight can never report less than the current height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const padding = el.offsetHeight - el.clientHeight + 16;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + padding)}px`;
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
        aria-label="Message"
      />
      <Button type="submit" disabled={sending || empty}>
        {sending ? 'Sending…' : 'Send'}
      </Button>
    </form>
  );
}
