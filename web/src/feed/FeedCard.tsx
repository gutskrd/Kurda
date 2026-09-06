import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { BookmarkIcon, CommentIcon, HeartIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { dayLabel } from '../chat/messageGroups';
import type { FeedItem } from '../lib/types';

import { CARD_LABEL } from './postKinds';

/**
 * One post on the wall.
 *
 * The card is the same for a story, a poem and a picture — the only difference
 * is what fills the middle. Three shapes of card for three tables would make the
 * merged feed look like three feeds someone stacked.
 *
 * The whole card is not one big link: the byline opens a person, the actions
 * act, and only the body takes you to the post. A card that swallowed every
 * click would make liking something a navigation.
 */
export function FeedCard({ item, onChanged }: { item: FeedItem; onChanged?: (next: FeedItem) => void }): React.JSX.Element {
  const { client, status } = useAuth();
  const { openProfile } = useProfileModal();
  const [busy, setBusy] = useState<'like' | 'bookmark' | null>(null);
  const signedIn = status === 'signedIn';

  async function toggle(kind: 'like' | 'bookmark'): Promise<void> {
    if (!signedIn || busy) return;
    setBusy(kind);
    const res = await client.post<{ on: boolean; engagement: FeedItem['engagement'] }>(
      `/posts/${item.targetType}/${item.id}/${kind}`,
    );
    setBusy(null);
    // the server returns the fresh totals; taking them keeps the count right
    // even when someone else liked it while this page was open
    if (res.ok && onChanged) onChanged({ ...item, engagement: res.data.engagement });
  }

  const { engagement: e } = item;

  /**
   * Say what the button does, not what it counts.
   *
   * These buttons show a number, and a number is what a screen reader would
   * announce as the name unless the label says otherwise — "4" tells you
   * nothing about what pressing it would do.
   */
  const actionLabel = (verb: string, undo: string, count?: number): string => {
    // a signed-out reader is invited to do the thing, never to undo it — they
    // cannot have done it, and "sign in to unlike" is nonsense whatever the
    // server happened to say about who liked what
    if (!signedIn) return `Sign in to ${verb.toLowerCase()}`;
    const label = undo;
    return count ? `${label} (${count})` : label;
  };

  return (
    <article className={`fcard fcard-${item.kind}`}>
      <header className="fcard-head">
        <button
          type="button"
          className="fcard-who"
          onClick={() => openProfile({ kind: 'user', userId: item.author.id, username: item.author.username })}
        >
          <Avatar url={item.author.avatarUrl} glyphSize={20} />
          <span className="fcard-who-text">
            <span className="fcard-name">{item.author.username}</span>
            <span className="fcard-when">
              <time dateTime={item.at}>{whenLabel(item.at)}</time>
            </span>
          </span>
        </button>
        <span className={`fcard-kind fcard-kind-${item.kind}`}>{CARD_LABEL[item.kind] ?? item.kind}</span>
      </header>

      <Link to={item.href} className="fcard-body">
        {item.title && <h2 className="fcard-title">{item.title}</h2>}
        {item.imageUrl && (
          <span className="fcard-shot">
            <img src={item.imageUrl} alt={item.excerpt ?? 'A picture'} loading="lazy" />
          </span>
        )}
        {item.excerpt && <p className="fcard-text">{item.excerpt}</p>}
      </Link>

      <footer className="fcard-actions">
        <Link to={item.href} className="fcard-act" aria-label={`${item.commentCount} comments`}>
          <CommentIcon size={18} />
          {item.commentCount > 0 && <span>{item.commentCount.toLocaleString()}</span>}
        </Link>

        <button
          type="button"
          className={`fcard-act fcard-like${e.liked ? ' is-on' : ''}`}
          disabled={!signedIn || busy !== null}
          aria-pressed={e.liked}
          aria-label={actionLabel('Like', e.liked ? 'Unlike' : 'Like', e.likes)}
          title={signedIn ? (e.liked ? 'Unlike' : 'Like') : 'Sign in to like'}
          onClick={() => void toggle('like')}
        >
          <HeartIcon size={18} weight={e.liked ? 'fill' : 'regular'} />
          {e.likes > 0 && <span>{e.likes.toLocaleString()}</span>}
        </button>

        <button
          type="button"
          className={`fcard-act fcard-save${e.bookmarked ? ' is-on' : ''}`}
          disabled={!signedIn || busy !== null}
          aria-pressed={e.bookmarked}
          aria-label={actionLabel('Save', e.bookmarked ? 'Remove from saved' : 'Save')}
          title={signedIn ? (e.bookmarked ? 'Remove from saved' : 'Save') : 'Sign in to save'}
          onClick={() => void toggle('bookmark')}
        >
          <BookmarkIcon size={18} weight={e.bookmarked ? 'fill' : 'regular'} />
        </button>
      </footer>
    </article>
  );
}

/** "Today", "Yesterday", a weekday, then a date — the wording chat uses. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayLabel(d);
}
