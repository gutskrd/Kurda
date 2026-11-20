import { Avatar } from '../components/Avatar';
import { useProfileModal } from '../profile/ProfileModal';
import { dayLabel } from '../chat/messageGroups';
import { useT } from '../i18n/I18nProvider';

/** Who wrote something, and when — shared by posts and comments. */
export interface Author {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** Set while the account is suspended or banned and what it shared was kept: the byline says so and opens nothing. */
  unavailable?: true;
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
  const t = useT();
  // A missing author must never stop a post from rendering.
  if (!author) return <div className={`byline byline-${size}`} />;
  // Kept content of a suspended or banned account: no face, no name, nothing to open.
  if (author.unavailable) {
    return (
      <div className={`byline byline-${size}`}>
        <span className="byline-who is-unavailable">
          <Avatar url={null} glyphSize={size === 'sm' ? 16 : 20} />
          <span className="byline-text">
            <span className="byline-name">{t('account.unavailableByline')}</span>
            {at && <time className="byline-when" dateTime={at}>{whenLabel(at)}</time>}
          </span>
        </span>
        {trailing && <span className="byline-trailing">{trailing}</span>}
      </div>
    );
  }
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
