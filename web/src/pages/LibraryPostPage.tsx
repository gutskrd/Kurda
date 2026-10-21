import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { ErrorState } from '../components/states';
import { PostSkeleton } from '../components/skeletons';
import { PostAuthor } from '../library/PostAuthor';
import { Comments } from '../library/Comments';
import { ArrowIcon } from '../components/icons';
import { Composer } from '../composer/Composer';
import { PostPictures } from '../composer/PostPictures';
import type { ComposedPost } from '../composer/types';
import { CARD_LABEL_KEY } from '../feed/postKinds';
import { PostActions, useEngagement } from '../feed/FeedCard';
import { useT } from '../i18n/I18nProvider';
import type { FeedItem, PostEngagement } from '../lib/types';
import { ReportAction } from '../reports/ReportAction';

const NO_ENGAGEMENT: PostEngagement = { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false };

/**
 * One written post, in full: a gotin, a çîrok or a helbest, its pictures, who
 * wrote it, its source, and its comments.
 *
 * It only knew stories and poems, so a gotin — a saying, with no title — had a
 * "Story" badge, an empty heading and a link back to the stories. A post can
 * carry pictures now, laid out as the wall lays them out and opening full size;
 * "Source / credit" sits under the words; and the author can edit it here.
 *
 * Under it, the same row of actions the wall has — the heart, comments,
 * repost, share and save — with the counts fetched for whoever is reading
 * (the post itself is public and cached the same for everyone).
 */
export function LibraryPostPage(): React.JSX.Element {
  const t = useT();
  const { user, client, status } = useAuth();
  const { id } = useParams<{ id: string }>();
  const { data: post, error, loading, reload } = useApiGet<ComposedPost>(`/library/posts/${id}`);
  const [editing, setEditing] = useState(false);
  // kept with the post it is for, so another post's numbers never show for a moment on this one
  const [counts, setCounts] = useState<{ id: string; engagement: PostEngagement } | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // asked once whoever is reading is known, so "liked" is yours and not a guest's
    if (status === 'restoring' || !id) return;
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ engagement?: PostEngagement }>(`/posts/library/${id}/engagement`);
      if (cancelled) return;
      // a failed count must not take the post down with it
      setCounts({ id, engagement: res.ok && res.data.engagement ? res.data.engagement : NO_ENGAGEMENT });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, status]);

  if (loading) return <div className="container container-narrow"><PostSkeleton /></div>;
  if (error || !post) {
    return (
      <div className="container container-narrow">
        <ErrorState message={error ?? t('library.notFound')} onRetry={reload} />
      </div>
    );
  }

  const back =
    post.type === 'poem'
      ? { to: '/app/civak?section=gotin&kind=helbest', label: t('library.allPoems') }
      : post.type === 'story'
        ? { to: '/app/civak?section=gotin&kind=cirok', label: t('library.allStories') }
        : { to: '/app/civak', label: t('civak.title') };
  // a meme is badged as one, not as the saying it is stored as (feed/postKinds)
  const kindKey = CARD_LABEL_KEY[post.meme ? 'meme' : post.type];
  const mine = user?.id === post.authorId;
  const pictures = post.media
    .filter((m) => m.url)
    .map((m) => ({ url: m.url!, alt: m.altText, width: m.width, height: m.height }));

  return (
    <div className="container container-narrow">
      <Link to={back.to} className="back-link">
        <ArrowIcon size={16} />
        {back.label}
      </Link>

      <article className={`post-full post-full-${post.type}`}>
        <div className="post-meta">
          {kindKey && <span className="badge">{t(kindKey)}</span>}
          {post.audioUrl && <span className="badge badge-gold">{t('library.audio')}</span>}
          <span>{t('library.reads', { count: post.viewCount.toLocaleString() })}</span>
          {mine && (
            <button type="button" className="post-edit" onClick={() => setEditing(true)} aria-haspopup="dialog">
              {t('post.edit')}
            </button>
          )}
        </div>

        {post.title && (
          <h1 className="page-title" dir="auto">
            {post.title}
          </h1>
        )}
        <PostAuthor
          author={post.author}
          at={post.publishedAt ?? post.createdAt}
          trailing={
            <ReportAction
              target={{ targetType: 'library_post', targetId: post.id }}
              authorId={post.author?.id}
              label={t('report.aboutPost')}
              block={post.author ? { userId: post.author.id, name: post.author.username } : null}
            />
          }
        />

        {post.audioUrl && (
          <audio className="post-audio" controls src={post.audioUrl}>
            {t('post.audioUnsupported')}
          </audio>
        )}

        {/* pre-wrap: a poem's line breaks are the poem */}
        {/* dir=auto: the post's own language decides its direction, not the interface's */}
        {post.body && (
          <div className={`post-body${post.title ? '' : ' post-body-saying'}`} dir="auto">
            {post.body}
          </div>
        )}

        <PostPictures className="post-pictures" images={pictures} />

        {post.sourceCredit && (
          <p className="post-source">
            {/* isolated (FSI…PDI), so a Latin credit under a Soranî label keeps its own order */}
            {t('post.source', { source: `\u2068${post.sourceCredit}\u2069` })}
          </p>
        )}

        <PostActionRow
          item={{
            key: `library:${post.id}`,
            targetType: 'library',
            id: post.id,
            kind: post.meme ? 'meme' : post.type,
            author: post.author ?? { id: post.authorId, username: '', avatarUrl: null },
            title: post.title,
            excerpt: post.body || null,
            imageUrl: pictures[0]?.url ?? null,
            images: pictures,
            meme: post.meme,
            href: `/app/library/${post.id}`,
            viewCount: post.viewCount,
            commentCount: post.commentCount,
            engagement: (counts?.id === post.id ? counts.engagement : null) ?? NO_ENGAGEMENT,
            at: post.publishedAt ?? post.createdAt,
          }}
          pending={counts?.id !== post.id}
          onChanged={(next) => setCounts({ id: post.id, engagement: next.engagement })}
          onComment={() => {
            const box = commentsRef.current;
            box?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            box?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
          }}
        />
      </article>

      <div ref={commentsRef} className="post-page-comments">
        <Comments postId={post.id} commentCount={post.commentCount} />
      </div>

      {editing && (
        <Composer
          editing={post}
          onClose={() => setEditing(false)}
          onPosted={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

/** The wall's row of actions, under the post on its own page. */
function PostActionRow({
  item,
  pending,
  onChanged,
  onComment,
}: {
  item: FeedItem;
  pending: boolean;
  onChanged: (next: FeedItem) => void;
  onComment: () => void;
}): React.JSX.Element {
  const engage = useEngagement(item, onChanged, pending);
  return <PostActions item={item} engage={engage} waiting={pending} onComment={onComment} />;
}
