import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorState } from '../components/states';
import { CommentsSkeleton } from '../components/skeletons';
import { PostAuthor, type Author } from './PostAuthor';
import { useT } from '../i18n/I18nProvider';
import { SendError } from '../reports/SendError';
import type { ApiError } from '../lib/types';
import { ReportAction } from '../reports/ReportAction';

/**
 * Threaded comments on a library post or a Dîmen picture. Both APIs have the same shape at different paths, so the
 * surfaces differ only by a table of URLs. Replies load per branch on demand, since a popular thread is mostly
 * collapsed.
 */

/** Which set of endpoints a thread talks to. */
type CommentSurface = 'library' | 'images';

const ROUTES: Record<CommentSurface, { thread: (postId: string) => string; replies: (id: string) => string; one: (id: string) => string }> = {
  library: {
    thread: (postId) => `/library/posts/${postId}/comments`,
    replies: (id) => `/library/comments/${id}/replies`,
    one: (id) => `/library/comments/${id}`,
  },
  images: {
    thread: (postId) => `/images/${postId}/comments`,
    replies: (id) => `/images/comments/${id}/replies`,
    one: (id) => `/images/comments/${id}`,
  },
};

interface Comment {
  id: string;
  postId: string;
  author: Author;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
}

/** How deep replies may nest before they stop indenting. */
const MAX_INDENT = 4;
const PAGE = 20;

export function Comments({
  postId,
  commentCount,
  surface = 'library',
}: {
  postId: string;
  commentCount: number;
  surface?: CommentSurface;
}): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The heading counts every comment including replies, which the loaded page cannot tell, so it starts from the
   * server's number and is adjusted by hand as comments are added or removed.
   */
  const [count, setCount] = useState(commentCount);
  useEffect(() => setCount(commentCount), [commentCount]);

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<{ comments: Comment[] }>(`${ROUTES[surface].thread(postId)}?limit=${PAGE}`);
    if (res.ok) setComments(res.data.comments);
    else {
      setComments([]);
      setError(describeError(res.error, t));
    }
  }, [client, postId, surface]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="comments" aria-label={t('comments.title')}>
      <h2 className="section-heading">
        {count === 1 ? t('comments.countOne') : t('comments.count', { count: count.toLocaleString() })}
      </h2>

      {status === 'signedIn' ? (
        <CommentForm
          postId={postId}
          surface={surface}
          onDone={load}
          onAdded={() => setCount((n) => n + 1)}
          placeholder={t('comments.add')}
        />
      ) : (
        <p className="muted">{t('comments.signInToJoin')}</p>
      )}

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {comments === null ? (
        <CommentsSkeleton />
      ) : comments.length === 0 ? (
        <p className="muted comments-empty">{t('comments.empty')}</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              postId={postId}
              surface={surface}
              onChanged={load}
              onCountChange={(d) => setCount((n) => Math.max(0, n + d))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One comment, its reply box, and its branch of replies (loaded on demand). */
function CommentNode({
  comment,
  postId,
  surface,
  onChanged,
  onCountChange,
}: {
  comment: Comment;
  postId: string;
  surface: CommentSurface;
  onChanged: () => Promise<void>;
  /** +1 for a comment added anywhere in this branch, -1 for one removed. */
  onCountChange: (delta: number) => void;
}): React.JSX.Element {
  const t = useT();
  const { client, user, status } = useAuth();
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReplies = useCallback(async () => {
    setLoading(true);
    const res = await client.get<{ comments: Comment[] }>(`${ROUTES[surface].replies(comment.id)}?limit=${PAGE}`);
    if (res.ok) setReplies(res.data.comments);
    setLoading(false);
  }, [client, comment.id, surface]);

  const removed = comment.status === 'removed';
  const mine = comment.author.id === user?.id;
  const indent = Math.min(comment.depth, MAX_INDENT);

  return (
    <li className="comment" style={{ marginLeft: indent > 0 ? 0 : undefined }}>
      <PostAuthor
        author={comment.author}
        at={comment.createdAt}
        size="sm"
        trailing={
          !removed && (
            <ReportAction
              target={{ targetType: surface === 'images' ? 'image_comment' : 'library_comment', targetId: comment.id }}
              authorId={comment.author?.id}
              label={t('report.aboutComment')}
              block={comment.author ? { userId: comment.author.id, name: comment.author.username } : null}
            />
          )
        }
      />

      <div className="comment-body">
        {removed ? <em className="muted">{t('comments.removed')}</em> : comment.body}
      </div>

      <div className="comment-actions">
        {status === 'signedIn' && !removed && (
          <button type="button" className="link-button" onClick={() => setReplying((v) => !v)}>
            {replying ? t('common.cancel') : t('comments.reply')}
          </button>
        )}
        {mine && !removed && (
          <ConfirmButton
            className="link-button danger"
            label={t('comments.delete')}
            title={t('comments.deleteThis')}
            onConfirm={async () => {
              const res = await client.delete(ROUTES[surface].one(comment.id));
              if (res.ok) onCountChange(-1);
              // Refetch either way, so a failure shows in the thread.
              await onChanged();
            }}
          />
        )}
        {comment.replyCount > 0 && replies === null && (
          <button type="button" className="link-button" onClick={() => void loadReplies()} disabled={loading}>
            {loading
              ? t('common.loading')
              : comment.replyCount === 1
                ? t('comments.showOneReply')
                : t('comments.showReplies', { count: comment.replyCount })}
          </button>
        )}
      </div>

      {replying && (
        <CommentForm
          postId={postId}
          surface={surface}
          parentId={comment.id}
          onAdded={() => onCountChange(1)}
          placeholder={t('comments.replyTo', { name: comment.author.username })}
          onDone={async () => {
            setReplying(false);
            // Open the branch the reply just joined.
            await loadReplies();
            await onChanged();
          }}
        />
      )}

      {replies && replies.length > 0 && (
        <ul className="comment-list comment-replies">
          {replies.map((r) => (
            <CommentNode
              key={r.id}
              comment={r}
              postId={postId}
              surface={surface}
              onChanged={loadReplies}
              onCountChange={onCountChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Write a comment, or a reply when given a parent. */
function CommentForm({
  postId,
  surface,
  parentId,
  placeholder,
  onDone,
  onAdded,
}: {
  postId: string;
  surface: CommentSurface;
  parentId?: string;
  placeholder: string;
  onDone: () => Promise<void>;
  /** Fired once the server has taken it. */
  onAdded: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const res = await client.post(ROUTES[surface].thread(postId), {
      body: text,
      ...(parentId ? { parentId } : {}),
    });
    setBusy(false);
    if (res.ok) {
      setBody('');
      onAdded();
      await onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <form className="comment-form" onSubmit={(e) => void submit(e)}>
      <textarea
        className="input comment-input"
        rows={2}
        value={body}
        maxLength={10_000}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
        aria-label={placeholder}
      />
      <SendError error={error} />
      <div className="comment-form-actions">
        <Button type="submit" size="sm" disabled={busy || body.trim().length === 0}>
          {busy ? t('comments.posting') : parentId ? t('comments.reply') : t('comments.submit')}
        </Button>
      </div>
    </form>
  );
}
