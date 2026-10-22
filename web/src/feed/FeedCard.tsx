import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { BookmarkIcon, CommentIcon, HeartIcon, RepostIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { SharePost } from './SharePost';
import { PostMenu } from './PostMenu';
import { dayLabel } from '../chat/messageGroups';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { FeedItem } from '../lib/types';
import { lastSeen } from '../social/time';

import { CARD_LABEL_KEY, cardKind } from './postKinds';
import { PostPictures } from '../composer/PostPictures';
import type { FeedImage } from '@kurda/shared';

type Kind = 'like' | 'bookmark' | 'repost';
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * One post on the wall: one link in a single chain of posts.
 *
 * No box round it: a hairline across the column ends one post and starts the
 * next. Every post has the same order, whatever kind it is, read top to
 * bottom as a list is: who posted it, what kind of post and when, all on one
 * line; then its words — a bold title and a few lines; then its pictures, set
 * in from the edges with round corners; then what can be done with it, as a
 * row of soft pills, each with its count.
 *
 * The whole post is not one big link: the name opens a person, the actions
 * act, and only the words take you to the post. A post that swallowed every
 * click would make liking something a navigation.
 *
 * On the post's own page (`onPage`) the same post is drawn in full: its words
 * do not link to where the reader already is, and the comment button goes to
 * the comments under it.
 */
export function FeedCard({
  item,
  onChanged,
  onRemoved,
  onPage,
}: {
  item: FeedItem;
  onChanged?: (next: FeedItem) => void;
  /** told when the author deletes this post, so the list can drop it */
  onRemoved?: (item: FeedItem) => void;
  /**
   * The post on its own page, with its comments under it: `onComment` is the
   * comment button, and `pending` holds the actions still while the page is
   * still finding out who has liked, reposted or saved it.
   */
  onPage?: { onComment: () => void; pending?: boolean };
}): React.JSX.Element {
  const { client, status } = useAuth();
  const { openProfile } = useProfileModal();
  const t = useT();
  const { locale } = useI18n();
  const waiting = onPage?.pending ?? false;
  const engage = useEngagement(item, onChanged, waiting);
  // the big heart over a picture, once per double click
  const [pop, setPop] = useState(0);
  const signedIn = status === 'signedIn';

  /** A double click on a picture likes the post — and only likes it: a second one never takes the like back. */
  function likeFromPicture(): void {
    if (waiting) return;
    setPop((n) => n + 1);
    if (!item.engagement.liked) void engage.toggle('like');
  }

  const badge = cardKind(item);
  const pictures = cardImages(item);
  const words = Boolean(item.title || item.excerpt);

  async function remove(): Promise<void> {
    const path = item.targetType === 'image' ? `/images/${item.id}` : `/library/posts/${item.id}`;
    const res = await client.delete(path);
    if (res.ok && onRemoved) onRemoved(item);
  }

  // dir=auto: a post is in the language it was written in, not the
  // interface's — Kurmancî under a Soranî menu must still read left to right
  const body = (
    <>
      {item.title && (
        <h2 className="fcard-title" dir="auto">
          {item.title}
        </h2>
      )}
      {item.excerpt && (
        <p className="fcard-text" dir="auto">
          {item.excerpt}
        </p>
      )}
    </>
  );

  return (
    <article className={`fcard fcard-${item.kind}${pictures.length > 0 ? ' has-pics' : ''}${onPage ? ' is-page' : ''}`}>
      {/* one line: who (a way to their profile), what kind of post and when, and the ⋯ at the end */}
      <header className="fcard-head">
        <button
          type="button"
          className="fcard-who"
          onClick={() => openProfile({ kind: 'user', userId: item.author.id, username: item.author.username })}
        >
          <Avatar url={item.author.avatarUrl} glyphSize={18} />
          <span className="fcard-name">{item.author.username}</span>
        </button>
        <span className="fcard-meta">
          {/* what kind of post this is, since the wall mixes them — quiet, beside the name, not a badge */}
          <span className="fcard-kind">{CARD_LABEL_KEY[badge] ? t(CARD_LABEL_KEY[badge]!) : badge}</span>
          <span aria-hidden="true"> · </span>
          <time className="fcard-when" dateTime={item.at} title={fullDate(item.at, locale)}>
            {postAge(item.at, t, locale)}
          </time>
        </span>
        <PostMenu item={item} onDelete={remove} />
      </header>

      {/* the words come first on every post, a picture's too: what it is, then what it shows */}
      {words &&
        (onPage ? (
          <div className="fcard-body">{body}</div>
        ) : (
          <Link to={item.href} className="fcard-body">
            {body}
          </Link>
        ))}

      {pictures.length > 0 && (
        <div className="fcard-media">
          {/* one at a time, swiped; each opens full size, so they sit outside any link (web/src/composer/PostPictures) */}
          <PostPictures className="fcard-pics" images={pictures} strip onDoubleActivate={signedIn ? likeFromPicture : undefined} />
          {pop > 0 && (
            <span key={pop} className="fcard-heart-pop" aria-hidden="true">
              <HeartIcon size={92} weight="fill" />
            </span>
          )}
        </div>
      )}

      <PostActions item={item} engage={engage} waiting={waiting} onComment={onPage?.onComment} />
    </article>
  );
}

interface Engage {
  busy: Kind | null;
  /** turned on here, by a press: only then does its icon land with a pop (and a like with its sparks) */
  justOn: { kind: Kind; n: number } | null;
  toggle: (kind: Kind) => Promise<void>;
}

/**
 * Liking, reposting and saving a post: one at a time, each a toggle the
 * server has the last word on.
 */
export function useEngagement(item: FeedItem, onChanged: ((next: FeedItem) => void) | undefined, waiting = false): Engage {
  const { client, status } = useAuth();
  const [busy, setBusy] = useState<Kind | null>(null);
  // never for a post that was already liked when the page drew it
  const [justOn, setJustOn] = useState<{ kind: Kind; n: number } | null>(null);

  async function toggle(kind: Kind): Promise<void> {
    if (status !== 'signedIn' || busy || waiting) return;
    const on = kind === 'like' ? item.engagement.liked : kind === 'repost' ? item.engagement.reposted : item.engagement.bookmarked;
    if (!on) setJustOn((j) => ({ kind, n: (j?.n ?? 0) + 1 }));
    setBusy(kind);
    const res = await client.post<{ on: boolean; engagement: FeedItem['engagement'] }>(
      `/posts/${item.targetType}/${item.id}/${kind}`,
    );
    setBusy(null);
    // the server returns the fresh totals; taking them keeps the count right
    // even when someone else liked it while this page was open
    if (res.ok && onChanged) onChanged({ ...item, engagement: res.data.engagement });
  }

  return { busy, justOn, toggle };
}

/**
 * The row under a post: the heart, comments and repost as soft pills at the
 * start, each with its count beside its icon, and share and save as round
 * buttons at the end — what is counted on one side, what is only done on the
 * other.
 *
 * All of it in ink until it is yours: the heart turns red and fills once you
 * have liked the post, a repost you made turns green, and a saved post's
 * bookmark fills in.
 */
export function PostActions({
  item,
  engage,
  waiting = false,
  onComment,
}: {
  item: FeedItem;
  engage: Engage;
  /** the counts are still on their way: the row is there, but holds still */
  waiting?: boolean;
  /** on the post's own page, where the comments are below: the comment button goes to them */
  onComment?: () => void;
}): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const { locale } = useI18n();
  const signedIn = status === 'signedIn';
  const { engagement: e } = item;
  const { busy, justOn, toggle } = engage;
  const count = (n: number): string => shortCount(n, locale);
  const held = !signedIn || busy !== null || waiting;

  /**
   * Say what the button does, not what it counts.
   *
   * These buttons show a number, and a number is what a screen reader would
   * announce as the name unless the label says otherwise — "4" tells you
   * nothing about what pressing it would do.
   */
  const actionLabel = (verb: string, undo: string, n?: number): string => {
    // a signed-out reader is invited to do the thing, never to undo it — they
    // cannot have done it, and "sign in to unlike" is nonsense whatever the
    // server happened to say about who liked what
    if (!signedIn) return t('feed.signInTo', { verb: verb.toLowerCase() });
    return n ? `${undo} (${n})` : undo;
  };

  const commentInner = (
    <>
      <CommentIcon size={20} />
      {item.commentCount > 0 && <span className="fcard-count">{count(item.commentCount)}</span>}
    </>
  );

  return (
    <footer className="fcard-actions" aria-busy={waiting || undefined}>
      <button
        type="button"
        className={`fcard-act fcard-like${e.liked ? ' is-on' : ''}${justOn?.kind === 'like' ? ' just-on' : ''}`}
        disabled={held}
        aria-pressed={e.liked}
        aria-label={actionLabel(t('feed.like'), e.liked ? t('feed.unlike') : t('feed.like'), e.likes)}
        title={signedIn ? (e.liked ? t('feed.unlike') : t('feed.like')) : t('feed.signInToLike')}
        onClick={() => void toggle('like')}
      >
        <HeartIcon size={20} weight={e.liked ? 'fill' : 'regular'} />
        {/* a fresh element for each like, so its sparks play once per press (styles/motion.css) */}
        {justOn?.kind === 'like' && <span key={justOn.n} className="fcard-burst" aria-hidden="true" />}
        {e.likes > 0 && <span className="fcard-count">{count(e.likes)}</span>}
      </button>

      {onComment ? (
        <button type="button" className="fcard-act" aria-label={t('feed.comments', { count: item.commentCount })} onClick={onComment}>
          {commentInner}
        </button>
      ) : (
        <Link to={item.href} className="fcard-act" aria-label={t('feed.comments', { count: item.commentCount })}>
          {commentInner}
        </Link>
      )}

      {/*
        Putting it on your own profile.

        A toggle like the heart, and for the same reason: a second press is
        how somebody takes it back, and the server decides what the state
        actually was. Your own post is repostable too — it is the one way to
        bring something old back up, and forbidding it would only be a rule
        to explain.
      */}
      <button
        type="button"
        className={`fcard-act fcard-repost${e.reposted ? ' is-on' : ''}${justOn?.kind === 'repost' ? ' just-on' : ''}`}
        disabled={held}
        aria-pressed={e.reposted}
        aria-label={actionLabel(t('repost.do'), e.reposted ? t('repost.undo') : t('repost.do'), e.reposts)}
        title={signedIn ? (e.reposted ? t('repost.undo') : t('repost.do')) : t('repost.signIn')}
        onClick={() => void toggle('repost')}
      >
        <RepostIcon size={20} weight={e.reposted ? 'bold' : 'regular'} />
        {e.reposts > 0 && <span className="fcard-count">{count(e.reposts)}</span>}
      </button>

      <SharePost item={item} />

      <button
        type="button"
        className={`fcard-act fcard-save${e.bookmarked ? ' is-on' : ''}${justOn?.kind === 'bookmark' ? ' just-on' : ''}`}
        disabled={held}
        aria-pressed={e.bookmarked}
        aria-label={actionLabel(t('feed.save'), e.bookmarked ? t('feed.removeFromSaved') : t('feed.save'))}
        title={signedIn ? (e.bookmarked ? t('feed.removeFromSaved') : t('feed.save')) : t('feed.signInToSave')}
        onClick={() => void toggle('bookmark')}
      >
        <BookmarkIcon size={20} weight={e.bookmarked ? 'fill' : 'regular'} />
      </button>
    </footer>
  );
}

/**
 * A card's pictures: every one the API sent, or — from an API older than
 * pictures on written posts — the single picture it had. Never the caption as
 * a picture's description: that read the words out twice and the picture not
 * at all.
 */
function cardImages(item: FeedItem): FeedImage[] {
  if (item.images && item.images.length > 0) return item.images;
  return item.imageUrl ? [{ url: item.imageUrl, alt: item.imageAlt ?? null, width: null, height: null }] : [];
}

/**
 * A count short enough for a pill: in full up to 9,999, then "12K", "1.2M" —
 * five pills have to fit across a phone, whatever a post has gathered.
 */
export function shortCount(n: number, locale: string): string {
  if (n < 10_000) return n.toLocaleString(locale);
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return n.toLocaleString(locale);
  }
}

/**
 * How long ago, short enough to sit beside a name on one line: "5m ago",
 * "3h ago", "2d ago" for the first week; after that, the date. The full date
 * and time are the element's title, for whoever points at it.
 */
function postAge(iso: string, t: Translate, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000) return lastSeen(iso, t);
  return dayLabel(d, new Date(), { locale, today: t('feed.today'), yesterday: t('feed.yesterday') });
}

function fullDate(iso: string, locale: string): string | undefined {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
}
