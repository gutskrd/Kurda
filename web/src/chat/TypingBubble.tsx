import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import { typingLabel } from './useTyping';

/**
 * A typing indicator: a bubble with three bouncing dots on the typist's side at the foot of the thread. The words are
 * announced politely to screen readers, and printed over the bubble in groups (`named`) to say who.
 */
export function TypingBubble({
  names,
  avatarUrl,
  named = false,
}: {
  /** who is writing, oldest first; nothing is drawn for nobody */
  names: readonly string[];
  /** their face, where the thread knows it (a conversation of two) */
  avatarUrl?: string | null;
  named?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  if (names.length === 0) return null;
  return (
    <div className="chat-run is-typing">
      <span className="chat-run-avatar" aria-hidden="true">
        <Avatar url={avatarUrl} glyphSize={18} />
      </span>
      <div className="chat-run-body">
        <span className={`chat-run-author${named ? '' : ' sr-only'}`} aria-live="polite">
          {typingLabel(names, t)}
        </span>
        <div className="bubble is-first is-last bubble-tail chat-typing-bubble" aria-hidden="true">
          <span className="chat-typing-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}
