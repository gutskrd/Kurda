import { useState } from 'react';
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
import { useT } from '../i18n/I18nProvider';

/**
 * One written post, in full: a gotin, a çîrok or a helbest, its pictures, who
 * wrote it, its source, and its comments.
 *
 * It only knew stories and poems, so a gotin — a saying, with no title — had a
 * "Story" badge, an empty heading and a link back to the stories. A post can
 * carry pictures now, laid out as the wall lays them out and opening full size;
 * "Source / credit" sits under the words; and the author can edit it here.
 */
export function LibraryPostPage(): React.JSX.Element {
  const t = useT();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const { data: post, error, loading, reload } = useApiGet<ComposedPost>(`/library/posts/${id}`);
  const [editing, setEditing] = useState(false);

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
        <PostAuthor author={post.author} at={post.publishedAt ?? post.createdAt} />

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
      </article>

      <Comments postId={post.id} commentCount={post.commentCount} />

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
