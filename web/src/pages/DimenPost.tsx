import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import type { FeedItem, ImagePost, PostEngagement } from '../lib/types';
import { ErrorState } from '../components/states';
import { PostSkeleton } from '../components/skeletons';
import { Comments } from '../library/Comments';
import { ArrowIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { FeedCard } from '../feed/FeedCard';

const NO_ENGAGEMENT: PostEngagement = { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false };

/**
 * One picture on its own page: the same post the wall shows — who posted it,
 * the picture, the heart and the rest, the caption — and the conversation
 * under it.
 *
 * The likes, reposts and saves are fetched separately from the post because
 * only that call knows whether you are among them — the post itself is public
 * and cached the same for everyone. Until they arrive the row of actions is
 * already there, waiting, so nothing under it moves when the numbers land.
 * Comments reuse the library's threaded component; the two APIs are the same
 * shape, and a second copy of the reply tree would drift.
 */
export function DimenPost(): React.JSX.Element {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { client, status } = useAuth();
  const navigate = useNavigate();
  const { data: post, error, loading, reload } = useApiGet<ImagePost>(`/images/${id}`);
  // kept with the post it is for, so another post's numbers never show for a moment on this one
  const [counts, setCounts] = useState<{ id: string; engagement: PostEngagement } | null>(null);
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // asked once whoever is reading is known, so "liked" is yours and not a guest's
    if (status === 'restoring' || !id) return;
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ engagement?: PostEngagement }>(`/posts/image/${id}/engagement`);
      if (cancelled) return;
      // a failed count must not take the picture down with it
      setCounts({ id, engagement: res.ok && res.data.engagement ? res.data.engagement : NO_ENGAGEMENT });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, status]);

  // the picture's sides are not in the post, so they are read off the picture
  // itself; until then it is held at the grid's usual shape, and moves once at
  // most, by the difference
  const imageUrl = post?.imageUrl ?? null;
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setSize({ url: imageUrl, width: img.naturalWidth, height: img.naturalHeight });
    img.src = imageUrl;
    return () => {
      img.onload = null;
    };
  }, [imageUrl]);

  if (loading) return <div className="container container-feed"><PostSkeleton withImage /></div>;
  if (error || !post) {
    return (
      <div className="container container-feed">
        <ErrorState message={error ?? t('dimen.notFound')} onRetry={reload} />
      </div>
    );
  }

  const engagement = counts?.id === post.id ? counts.engagement : null;
  const measured = size?.url === post.imageUrl ? size : null;
  const item: FeedItem = {
    key: `image:${post.id}`,
    targetType: 'image',
    id: post.id,
    kind: post.category === 'meme' ? 'meme' : 'image',
    author: post.author,
    title: null,
    excerpt: post.caption,
    imageUrl: post.imageUrl,
    imageAlt: null,
    images: post.imageUrl ? [{ url: post.imageUrl, alt: null, width: measured?.width ?? null, height: measured?.height ?? null }] : [],
    href: `/app/dimen/${post.id}`,
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    engagement: engagement ?? NO_ENGAGEMENT,
    at: post.createdAt,
  };

  return (
    <div className="container container-feed post-page">
      <Link to="/app/civak?section=dimen" className="back-link">
        <ArrowIcon size={16} />
        {t('dimen.allPictures')}
      </Link>

      <FeedCard
        item={item}
        onChanged={(next) => setCounts({ id: post.id, engagement: next.engagement })}
        onRemoved={() => navigate('/app/civak?section=dimen', { replace: true })}
        onPage={{
          pending: engagement === null,
          onComment: () => {
            const box = commentsRef.current;
            box?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            box?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
          },
        }}
      />

      <div ref={commentsRef} className="post-page-comments">
        <Comments postId={post.id} commentCount={post.commentCount} surface="images" />
      </div>
    </div>
  );
}
