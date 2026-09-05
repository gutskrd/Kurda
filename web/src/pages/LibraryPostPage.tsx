import { Link, useParams } from 'react-router-dom';
import { useApiGet } from '../lib/useApi';
import { Loading, ErrorState } from '../components/states';
import { PostAuthor, type Author } from '../library/PostAuthor';
import { Comments } from '../library/Comments';
import { ArrowIcon } from '../components/icons';

interface Post {
  id: string;
  author: Author;
  type: 'story' | 'poem';
  title: string;
  body: string;
  viewCount: number;
  commentCount: number;
  audioUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
}

/**
 * One story or poem, in full, with its author and its comments.
 *
 * The library only ever showed cards with an excerpt and no way to open one, so
 * a post could not actually be read — and the comment system, which the server
 * has supported all along, had nowhere to live.
 */
export function LibraryPostPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data: post, error, loading, reload } = useApiGet<Post>(`/library/posts/${id}`);

  if (loading) return <div className="container container-narrow"><Loading /></div>;
  if (error || !post) {
    return (
      <div className="container container-narrow">
        <ErrorState message={error ?? 'That post could not be found.'} onRetry={reload} />
      </div>
    );
  }

  const backTo = post.type === 'poem' ? '/app/poems' : '/app/stories';

  return (
    <div className="container container-narrow">
      <Link to={backTo} className="back-link">
        <ArrowIcon size={16} />
        {post.type === 'poem' ? 'All poems' : 'All stories'}
      </Link>

      <article className="post-full">
        <div className="post-meta">
          <span className="badge">{post.type === 'poem' ? 'Poem' : 'Story'}</span>
          {post.audioUrl && <span className="badge badge-gold">Audio</span>}
          <span>{post.viewCount.toLocaleString()} reads</span>
        </div>

        <h1 className="page-title">{post.title}</h1>
        <PostAuthor author={post.author} at={post.publishedAt ?? post.createdAt} />

        {post.audioUrl && (
          <audio className="post-audio" controls src={post.audioUrl}>
            Your browser cannot play this recording.
          </audio>
        )}

        {/* pre-wrap: a poem's line breaks are the poem */}
        <div className="post-body">{post.body}</div>
      </article>

      <Comments postId={post.id} commentCount={post.commentCount} />
    </div>
  );
}
