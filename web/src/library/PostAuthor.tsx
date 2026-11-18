import { Avatar } from '../components/Avatar';
import { useProfileModal } from '../profile/ProfileModal';
import { dayLabel } from '../chat/messageGroups';

/** Who wrote something, and when — shared by posts and comments. */
export interface Author {
  id: string;
  username: string;
  avatarUrl: string | null;
}

/** The byline on a post or comment; the face and the name open that person's profile. */
export function PostAuthor({
  author,
  at,
  size = 'md',
  trailing,
}: {
  /** The server always sends one; undefined only if a response is truncated. */
  author: Author | undefined;
  /** ISO timestamp shown beside the name. */
  at?: string;
  size?: 'sm' | 'md';
  /** Anything on the right of the byline, such as a menu or a badge. */
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const { openProfile } = useProfileModal();
  // A missing author must never stop a post from rendering.
  if (!author) return <div className={`byline byline-${size}`} />;
  return (
    <div className={`byline byline-${size}`}>
      <button
        type="button"
        className="byline-who"
        onClick={() => openProfile({ kind: 'user', userId: author.id, username: author.username })}
      >
        <Avatar url={author.avatarUrl} glyphSize={size === 'sm' ? 16 : 20} />
        <span className="byline-text">
          <span className="byline-name">{author.username}</span>
          {at && <time className="byline-when" dateTime={at}>{whenLabel(at)}</time>}
        </span>
      </button>
      {trailing && <span className="byline-trailing">{trailing}</span>}
    </div>
  );
}

/** "Today", "Yesterday", a weekday, then a date — the same wording chat uses. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayLabel(d);
}
