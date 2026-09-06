import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ImagePost } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Avatar } from '../components/Avatar';
import { HeartIcon, CommentIcon } from '../components/icons';
import { PostPicture } from '../images/PostPicture';

const PAGE = 24;

type Category = 'all' | 'meme' | 'image';
type Sort = 'newest' | 'popular';

/**
 * Dîmen — the community's pictures.
 *
 * The API has served image posts, reactions and threaded comments since KUR-290,
 * and the web app had no page for any of it: profiles could say "Dîmen" and
 * point nowhere. This is the wall those posts live on.
 *
 * Filters are query state rather than four separate fetches kept in sync — one
 * request describes exactly what is on screen.
 */
export function Dimen(): React.JSX.Element {
  const { client } = useAuth();
  const [posts, setPosts] = useState<ImagePost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const params = new URLSearchParams({ sort, limit: String(PAGE), offset: String(offset) });
      if (category !== 'all') params.set('category', category);
      const res = await client.get<{ posts: ImagePost[] }>(`/images?${params}`);
      if (!res.ok) {
        setError(describeError(res.error));
        setPosts([]);
        return;
      }
      setError(null);
      const batch = res.data.posts ?? [];
      setPosts((prev) => (offset === 0 ? batch : [...(prev ?? []), ...batch]));
      setMore(batch.length === PAGE);
    },
    [client, category, sort],
  );

  useEffect(() => {
    setPosts(null);
    void load(0);
  }, [load]);

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">Dîmen · Pictures</span>
        <h1 className="page-title">Dîmen</h1>
        <p className="page-sub">Pictures and memes from the community.</p>
        {/* your picture goes to the front of the wall, where you can see it —
            not somewhere down a list you have to go hunting through */}
        <PostPicture onPosted={(post) => setPosts((prev) => [post, ...(prev ?? [])])} />
      </div>

      <div className="dimen-filters">
        <div className="seg" role="group" aria-label="Category">
          {(['all', 'meme', 'image'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`seg-btn${category === c ? ' is-active' : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c === 'all' ? 'Everything' : c === 'meme' ? 'Memes' : 'Photos'}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Sort">
          {(['newest', 'popular'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`seg-btn${sort === s ? ' is-active' : ''}`}
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
            >
              {s === 'newest' ? 'Newest' : 'Popular'}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {posts === null ? (
        <Loading label="Loading pictures…" />
      ) : posts.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <>
          <div className="dimen-grid">
            {posts.map((p) => (
              <DimenCard key={p.id} post={p} />
            ))}
          </div>
          {more && (
            <button type="button" className="mkp-more" onClick={() => void load(posts.length)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** One tile on the wall: the picture, who posted it, and how it is doing. */
function DimenCard({ post }: { post: ImagePost }): React.JSX.Element {
  return (
    <Link to={`/app/dimen/${post.id}`} className="dimen-card">
      <span className="dimen-thumb">
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.caption ?? 'A picture'} loading="lazy" />
        ) : (
          <span className="dimen-thumb-empty" aria-hidden="true" />
        )}
      </span>
      <span className="dimen-card-foot">
        <Avatar url={post.author?.avatarUrl ?? null} glyphSize={14} />
        <span className="dimen-card-who">{post.author?.username ?? 'Someone'}</span>
        <span className="dimen-card-counts">
          {post.reactionCount > 0 && (
            <span><HeartIcon size={13} /> {post.reactionCount.toLocaleString()}</span>
          )}
          {post.commentCount > 0 && (
            <span><CommentIcon size={13} /> {post.commentCount.toLocaleString()}</span>
          )}
        </span>
      </span>
      {post.caption && <span className="dimen-card-caption">{post.caption}</span>}
    </Link>
  );
}
