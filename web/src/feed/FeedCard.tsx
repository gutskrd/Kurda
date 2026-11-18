import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { failureText, useOptimistic, useOptimisticSend } from '../lib/optimistic';
import { Avatar } from '../components/Avatar';
import { BookmarkIcon, CommentIcon, HeartIcon, RepostIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { SharePost } from './SharePost';
import { PostMenu } from './PostMenu';
import { dayLabel } from '../chat/messageGroups';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { Translate } from '../i18n/I18nProvider';
import type { ApiError, FeedItem } from '../lib/types';
import { useGrowsFrom, useGrowsInto } from '../lib/viewTransition';
import { lastSeen } from '../social/time';

import { CARD_LABEL_KEY, cardKind } from './postKinds';
import { PostPictures } from '../composer/PostPictures';
import type { FeedImage } from '@kurda/shared';

type Kind = 'like' | 'bookmark' | 'repost';

/**
 * One post on the wall, separated from the next by a hairline. Every kind has the same order: the author, kind and
 * age on one line, then the words, the pictures and the action pills with their counts. Only the words link to the
 * post, so liking never navigates. On the post's own page (`onPage`) the words do not link and the comment button
 * goes to the comments below.
 */
export function FeedCard({
  item,
  onChanged,
  onRemoved,
  onPage,
}: {
  item: FeedItem;
  onChanged?: (next: FeedItem) => void;
  /** Called when the author deletes this post, so the list can drop it. */
  onRemoved?: (item: FeedItem) => void;
  /** On the post's own page: `onComment` is the comment button, and `pending` holds the actions while counts load. */
  onPage?: { onComment: () => void; pending?: boolean };
}): React.JSX.Element | null {
  const { client, status } = useAuth();
  const { openProfile } = useProfileModal();
  const t = useT();
  const { locale } = useI18n();
  const waiting = onPage?.pending ?? false;
  const engage = useEngagement(item, onChanged, waiting);
  // The big heart over a picture, once per double click.
  const [pop, setPop] = useState(0);
  const [gone, setGone] = useState(false);
  const sendShown = useOptimisticSend();
  const signedIn = status === 'signedIn';

  /** A double click on a picture likes the post; another never takes the like back. */
  function likeFromPicture(): void {
    if (waiting) return;
    setPop((n) => n + 1);
    if (!engage.engagement.liked) engage.toggle('like');
  }

  const badge = cardKind(item);
  const pictures = cardImages(item);
  const words = Boolean(item.title || item.excerpt);
  // On a wall the card carries over to the post's own page when opened; on that page it is the arriving end.
  const fromWall = useGrowsFrom(onPage ? null : `post:${item.key}`, { shape: 'card' });
  const intoPage = useGrowsInto(onPage ? `post:${item.key}` : null, { shape: 'card' });

  /** Gone at once once confirmed; the list drops it when the server agrees, and a refusal brings it back in its place. */
  async function remove(): Promise<void> {
    const path = item.targetType === 'image' ? `/images/${item.id}` : `/library/posts/${item.id}`;
    setGone(true);
    const res = await sendShown(() => client.delete(path), { undo: () => setGone(false) }, { goneIsDone: true });
    if (res.ok || res.error.status === 404) onRemoved?.(item);
  }

  if (gone) return null;

  // dir=auto: a post is in the language it was written in, not the interface's.
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
    <article ref={onPage ? intoPage : fromWall} className={`fcard fcard-${item.kind}${pictures.length > 0 ? ' has-pics' : ''}${onPage ? ' is-page' : ''}`}>
      {/* One line: the author (linking to their profile), the kind and age, and the ⋯ menu. */}
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
          {/* The post's kind, quietly beside the name, since the wall mixes kinds. */}
          <span className="fcard-kind">{CARD_LABEL_KEY[badge] ? t(CARD_LABEL_KEY[badge]!) : badge}</span>
          <span aria-hidden="true"> · </span>
          <time className="fcard-when" dateTime={item.at} title={fullDate(item.at, locale)}>
            {postAge(item.at, t, locale)}
          </time>
        </span>
        <PostMenu item={item} onDelete={remove} />
      </header>

      {/* The words come first on every post, pictures included. */}
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
          {/* Swiped one at a time; each opens full size, so they sit outside any link (composer/PostPictures). */}
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
  /** The post's likes, reposts and saves as the reader sees them, including unanswered presses. */
  engagement: FeedItem['engagement'];
  /** Turned on by a press here; only then does its icon pop, and a like sparkle. */
  justOn: { kind: Kind; n: number } | null;
  /** Why the last press was undone, shown under the row for a few seconds; null otherwise. */
  refused: string | null;
  toggle: (kind: Kind) => void;
}

/** How long the refusal message stays under the row. */
const REFUSED_MS = 4000;

const STATE: Record<Kind, 'liked' | 'reposted' | 'bookmarked'> = { like: 'liked', repost: 'reposted', bookmark: 'bookmarked' };
const COUNT: Record<Kind, 'likes' | 'reposts' | 'bookmarks'> = { like: 'likes', repost: 'reposts', bookmark: 'bookmarks' };
const KINDS: Kind[] = ['like', 'repost', 'bookmark'];

/** The server's numbers with the reader's presses laid over them. */
function withPresses(e: FeedItem['engagement'], shown: Record<Kind, boolean>): FeedItem['engagement'] {
  const next = { ...e };
  for (const kind of KINDS) {
    const on = shown[kind];
    if (on === e[STATE[kind]]) continue;
    next[STATE[kind]] = on;
    next[COUNT[kind]] = Math.max(0, (e[COUNT[kind]] ?? 0) + (on ? 1 : -1));
  }
  return next;
}

/**
 * Liking, reposting and saving a post as optimistic toggles (lib/optimistic.ts), each independent of the others. Each
 * request sets a state rather than flipping it, quick presses end in the last one, and the server's totals replace the
 * guess; a refused or lost press is undone with a message.
 */
export function useEngagement(item: FeedItem, onChanged: ((next: FeedItem) => void) | undefined, waiting = false): Engage {
  const { client, status } = useAuth();
  const t = useT();
  // Never for a post that was already liked when the page drew it.
  const [justOn, setJustOn] = useState<{ kind: Kind; n: number } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // The post as it is now, for an answer that arrives after another has changed it.
  const latest = useRef(item);
  latest.current = item;

  useEffect(() => {
    if (!refused) return;
    const id = window.setTimeout(() => setRefused(null), REFUSED_MS);
    return () => window.clearTimeout(id);
  }, [refused]);

  const line = (kind: Kind) => ({
    send: (on: boolean) => client.post<{ on: boolean; engagement: FeedItem['engagement'] }>(`/posts/${item.targetType}/${item.id}/${kind}`, { on }),
    options: {
      fromAnswer: (data: { on: boolean }) => data.on,
      // The server's fresh totals keep the count right even if someone else liked it meanwhile.
      onSaved: (data: { engagement: FeedItem['engagement'] }) => onChanged?.({ ...latest.current, engagement: data.engagement }),
      // Undone, with the reason shown, so nothing looks done that was not.
      onFailed: (error: ApiError) => {
        setJustOn((j) => (j?.kind === kind ? null : j));
        setRefused(failureText(error, t));
      },
    },
  });
  const like = line('like');
  const repost = line('repost');
  const bookmark = line('bookmark');
  const lines = {
    like: useOptimistic(item.engagement.liked, like.send, like.options),
    repost: useOptimistic(item.engagement.reposted, repost.send, repost.options),
    bookmark: useOptimistic(item.engagement.bookmarked, bookmark.send, bookmark.options),
  };
  const engagement = withPresses(item.engagement, { like: lines.like[0], repost: lines.repost[0], bookmark: lines.bookmark[0] });

  function toggle(kind: Kind): void {
    if (status !== 'signedIn' || waiting) return;
    const on = !lines[kind][0];
    setRefused(null);
    lines[kind][1](on);
    if (on) setJustOn((j) => ({ kind, n: (j?.n ?? 0) + 1 }));
  }

  return { engagement, justOn, refused, toggle };
}

/**
 * The row under a post: like, comment and repost as pills with counts at the start, share and save as round buttons
 * at the end. The heart turns red once liked, a repost turns green and a saved bookmark fills.
 */
export function PostActions({
  item,
  engage,
  waiting = false,
  onComment,
}: {
  item: FeedItem;
  engage: Engage;
  /** The counts are still loading, so the row is shown but inactive. */
  waiting?: boolean;
  /** On the post's own page, the comment button goes to the comments below. */
  onComment?: () => void;
}): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const { locale } = useI18n();
  const signedIn = status === 'signedIn';
  const { engagement: e, justOn, refused, toggle } = engage;
  const count = (n: number): string => shortCount(n, locale);
  // Only a row that cannot act is held; a press in flight does not hold the other two.
  const held = !signedIn || waiting;

  /** Labels a button by what it does, not the number it shows, which a screen reader would otherwise announce. */
  const actionLabel = (verb: string, undo: string, n?: number): string => {
    // A signed-out reader is invited to do the thing, never to undo it.
    if (!signedIn) return t('feed.signInTo', { verb: verb.toLowerCase() });
    return n ? `${undo} (${n})` : undo;
  };

  const commentInner = (
    <>
      <CommentIcon size={20} />
      {item.commentCount > 0 && <span className="fcard-count">{count(item.commentCount)}</span>}
    </>
  );

  const row = (
    <footer className="fcard-actions" aria-busy={waiting || undefined}>
      <button
        type="button"
        className={`fcard-act fcard-like${e.liked ? ' is-on' : ''}${justOn?.kind === 'like' ? ' just-on' : ''}`}
        disabled={held}
        aria-pressed={e.liked}
        aria-label={actionLabel(t('feed.like'), e.liked ? t('feed.unlike') : t('feed.like'), e.likes)}
        title={signedIn ? (e.liked ? t('feed.unlike') : t('feed.like')) : t('feed.signInToLike')}
        onClick={() => toggle('like')}
      >
        <HeartIcon size={20} weight={e.liked ? 'fill' : 'regular'} />
        {/* A fresh element per like, so the sparks play once per press, only around a filled heart (styles/motion.css). */}
        {justOn?.kind === 'like' && e.liked && <span key={justOn.n} className="fcard-burst" aria-hidden="true" />}
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

      {/* Repost to your profile: a toggle like the heart. Your own posts can be reposted, to bring old ones back up. */}
      <button
        type="button"
        className={`fcard-act fcard-repost${e.reposted ? ' is-on' : ''}${justOn?.kind === 'repost' ? ' just-on' : ''}`}
        disabled={held}
        aria-pressed={e.reposted}
        aria-label={actionLabel(t('repost.do'), e.reposted ? t('repost.undo') : t('repost.do'), e.reposts)}
        title={signedIn ? (e.reposted ? t('repost.undo') : t('repost.do')) : t('repost.signIn')}
        onClick={() => toggle('repost')}
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
        onClick={() => toggle('bookmark')}
      >
        <BookmarkIcon size={20} weight={e.bookmarked ? 'fill' : 'regular'} />
      </button>
    </footer>
  );

  return (
    <>
      {row}
      {/* An undone press and why, shown beside it and cleared by itself. */}
      {refused && (
        <p className="fcard-refused" role="status">
          {refused}
        </p>
      )}
    </>
  );
}

/**
 * A card's pictures: every one the API sent, or the single `image` of an older answer. The caption is never used as
 * alt text, since it would read the words twice and the picture not at all.
 */
function cardImages(item: FeedItem): FeedImage[] {
  if (item.images && item.images.length > 0) return item.images;
  return item.imageUrl ? [{ url: item.imageUrl, alt: item.imageAlt ?? null, width: null, height: null }] : [];
}

/** A count short enough for a pill: in full up to 9,999, then "12K" or "1.2M", so five pills fit across a phone. */
export function shortCount(n: number, locale: string): string {
  if (n < 10_000) return n.toLocaleString(locale);
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return n.toLocaleString(locale);
  }
}

/** How long ago, briefly: "5m ago", "3h ago" or "2d ago" within a week, then the date; the full time is the title. */
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
