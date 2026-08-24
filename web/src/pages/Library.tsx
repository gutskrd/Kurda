import { useState } from 'react';
import { useApiGet } from '../lib/useApi';
import { Loading, ErrorState, EmptyState } from '../components/states';
import type { LibraryPost } from '../lib/types';

type Sort = 'newest' | 'popular';

function excerpt(body: string, n = 180): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

/**
 * Browse the public community library, filtered to one type. `/library/posts`
 * is the one endpoint the API serves without auth, so Stories and Poems show
 * real content to signed-out visitors.
 */
export function Library({
  type,
  title,
  eyebrow,
  intro,
}: {
  type: 'story' | 'poem';
  title: string;
  eyebrow: string;
  intro: string;
}): React.JSX.Element {
  const [sort, setSort] = useState<Sort>('newest');
  const { data, error, loading, reload } = useApiGet<{ posts: LibraryPost[] }>(
    `/library/posts?type=${type}&sort=${sort}&limit=40`,
  );

  const posts = data?.posts ?? [];

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{intro}</p>
      </div>

      <div className="toolbar" role="tablist" aria-label="Sort">
        <button className={`chip${sort === 'newest' ? ' active' : ''}`} onClick={() => setSort('newest')}>
          Newest
        </button>
        <button className={`chip${sort === 'popular' ? ' active' : ''}`} onClick={() => setSort('popular')}>
          Most read
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : posts.length === 0 ? (
        <EmptyState
          title={`No ${type === 'story' ? 'stories' : 'poems'} yet`}
          message="Be the first to contribute — new pieces from the community will appear here."
        />
      ) : (
        <div className="post-list">
          {posts.map((p) => (
            <article className="post" key={p.id}>
              <div className="post-meta">
                <span className="badge">{p.type === 'poem' ? 'Poem' : 'Story'}</span>
                {p.audioUrl && <span className="badge badge-gold">Audio</span>}
                <span>{p.viewCount.toLocaleString()} reads</span>
              </div>
              <h3>{p.title}</h3>
              <p className="post-excerpt">{excerpt(p.body)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stories(): React.JSX.Element {
  return (
    <Library
      type="story"
      eyebrow="Çîrok · Community library"
      title="Stories"
      intro="Read short stories in Kurdish, written and narrated by the MyKurda community. Many include audio you can listen along to."
    />
  );
}

export function Poems(): React.JSX.Element {
  return (
    <Library
      type="poem"
      eyebrow="Helbest · Community library"
      title="Poems"
      intro="A living collection of Kurdish poetry — from the classics to new voices, shared by readers like you."
    />
  );
}
