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
import { useGrowsInto } from '../lib/viewTransition';
import { FeedCard } from '../feed/FeedCard';

const NO_ENGAGEMENT: PostEngagement = { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false };

/**
 * One picture on its own page: the wall's post and its conversation. Likes, reposts and saves are fetched separately,
 * since only that call knows whether you are among them (the post is public and cached for everyone); the action row
 * holds its place until they arrive. Comments reuse the library's threaded component, as the two APIs share a shape.
 */
export function DimenPost(): React.JSX.Element {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { client, status } = useAuth();
  const navigate = useNavigate();
  const { data: post, error, loading, reload } = useApiGet<ImagePost>(`/images/${id}`);
  // Kept with its post, so another post's numbers never show here for a moment.
  const [counts, setCounts] = useState<{ id: string; engagement: PostEngagement } | null>(null);
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  // A wall card's picture lands on this post (feed/FeedCard.tsx); promised before the post arrives, so the page is held for it.
  useGrowsInto(`post:image:${id}`, { shape: 'card' });

  useEffect(() => {
    // Fetched once the reader is known, so "liked" is yours and not a guest's.
    if (status === 'restoring' || !id) return;
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ engagement?: PostEngagement }>(`/posts/image/${id}/engagement`);
      if (cancelled) return;
      // A failed count must not take the picture down with it.
      setCounts({ id, engagement: res.ok && res.data.engagement ? res.data.engagement : NO_ENGAGEMENT });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, status]);

  // The post does not give the picture's sides, so they are read off the image; until then it holds the grid's usual
  // shape and moves at most once.
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
