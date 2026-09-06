import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import type { ImagePost } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { PostAuthor } from '../library/PostAuthor';
import { Comments } from '../library/Comments';
import { Reactions, type ReactionSummary } from '../images/Reactions';
import { ArrowIcon } from '../components/icons';

const NO_REACTIONS: ReactionSummary = { counts: {}, total: 0, mine: null };

/**
 * One picture, in full, with who posted it, how people reacted, and the
 * conversation under it.
 *
 * Reactions are fetched separately from the post because only that call knows
 * the viewer's own reaction — the post itself is public and cached the same for
 * everyone. Comments reuse the library's threaded component; the two APIs are
 * the same shape, and a second copy of the reply tree would drift.
 */
export function DimenPost(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { client } = useAuth();
  const { data: post, error, loading, reload } = useApiGet<ImagePost>(`/images/${id}`);
  const [reactions, setReactions] = useState<ReactionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReactions(null);
    void (async () => {
      const res = await client.get<ReactionSummary>(`/images/${id}/reactions`);
      if (cancelled) return;
      // a failed reactions call must not take the picture down with it
      setReactions(res.ok ? res.data : NO_REACTIONS);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id]);

  if (loading) return <div className="container container-narrow"><Loading /></div>;
  if (error || !post) {
    return (
      <div className="container container-narrow">
        <ErrorState message={error ?? 'That picture could not be found.'} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="container container-narrow">
      <Link to="/app/dimen" className="back-link">
        <ArrowIcon size={16} />
        All pictures
      </Link>

      <article className="dimen-full">
        <div className="post-meta">
          <span className="badge">{post.category === 'meme' ? 'Meme' : 'Photo'}</span>
          <span>{post.viewCount.toLocaleString()} views</span>
        </div>

        {post.imageUrl ? (
          <img className="dimen-full-img" src={post.imageUrl} alt={post.caption ?? 'A picture'} />
        ) : (
          <div className="dimen-full-img dimen-thumb-empty" aria-hidden="true" />
        )}

        <PostAuthor author={post.author} at={post.createdAt} />
        {post.caption && <p className="dimen-caption">{post.caption}</p>}

        {reactions === null ? (
          <div className="reactions" aria-hidden />
        ) : (
          <Reactions postId={post.id} initial={reactions} />
        )}
      </article>

      <Comments postId={post.id} commentCount={post.commentCount} surface="images" />
    </div>
  );
}
