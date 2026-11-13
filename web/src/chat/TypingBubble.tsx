import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import { typingLabel } from './useTyping';

/**
 * Somebody is writing: a bubble on their side of the thread, where their
 * words are about to be, with three dots dropping into it one after another.
 *
 * It was a line of small grey text between the thread and the box, which is
 * read only by someone looking for it. A bubble is where the eye already is —
 * at the foot of the conversation — and says the same thing without a word:
 * the next message is on its way.
 *
 * The words are still there for a screen reader, announced politely, and in
 * a group (`named`) they are printed over the bubble, since there the bubble
 * alone does not say who.
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
