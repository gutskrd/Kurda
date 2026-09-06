import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { Loading, ErrorState } from '../components/states';
import { PostAuthor, type Author } from './PostAuthor';

/**
 * Threaded comments on a post.
 *
 * The server has supported replies since the table was created — `parent_comment_id`,
 * `depth`, `reply_count`, and an endpoint per branch — but nothing on the web
 * ever rendered any of it. This is that missing half.
 *
 * Replies load per branch on demand rather than the whole tree at once: a
 * popular thread is mostly collapsed, and fetching every descendant to show
 * three of them wastes the reader's time and the server's.
 *
 * Two surfaces use it — library posts and Dîmen pictures. The APIs are the same
 * shape at different paths, so the difference is a table of URLs rather than a
 * second copy of the tree, the reply boxes and the tombstones to keep in step.
 */

/** Which set of endpoints a thread talks to. */
export type CommentSurface = 'library' | 'images';

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
  const { client, status } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The heading counts every comment in the thread, replies included, so it
   * cannot be read off the loaded page — that is only the top level, and only
   * the first page of it. The server's number is the truth on arrival; after
   * that we move it by hand, because "0 comments" above the comment you just
   * wrote reads as a bug.
   */
  const [count, setCount] = useState(commentCount);
  useEffect(() => setCount(commentCount), [commentCount]);

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<{ comments: Comment[] }>(`${ROUTES[surface].thread(postId)}?limit=${PAGE}`);
    if (res.ok) setComments(res.data.comments);
    else {
      setComments([]);
      setError(describeError(res.error));
    }
  }, [client, postId, surface]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="comments" aria-label="Comments">
      <h2 className="section-heading">
        {count === 1 ? '1 comment' : `${count.toLocaleString()} comments`}
      </h2>

      {status === 'signedIn' ? (
        <CommentForm
          postId={postId}
          surface={surface}
          onDone={load}
          onAdded={() => setCount((n) => n + 1)}
          placeholder="Add a comment…"
        />
      ) : (
        <p className="muted">Sign in to join the conversation.</p>
      )}

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {comments === null ? (
        <Loading />
      ) : comments.length === 0 ? (
        <p className="muted comments-empty">No comments yet. Be the first to say something.</p>
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
  /** +1 for a comment added anywhere in this branch, -1 for one removed */
  onCountChange: (delta: number) => void;
}): React.JSX.Element {
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
      <PostAuthor author={comment.author} at={comment.createdAt} size="sm" />

      <div className="comment-body">
        {removed ? <em className="muted">This comment was removed.</em> : comment.body}
      </div>

      <div className="comment-actions">
        {status === 'signedIn' && !removed && (
          <button type="button" className="link-button" onClick={() => setReplying((v) => !v)}>
            {replying ? 'Cancel' : 'Reply'}
          </button>
        )}
        {mine && !removed && (
          <button
            type="button"
            className="link-button danger"
            onClick={async () => {
              if (!confirm('Delete this comment?')) return;
              const res = await client.delete(ROUTES[surface].one(comment.id));
              if (res.ok) onCountChange(-1);
              await onChanged();
            }}
          >
            Delete
          </button>
        )}
        {comment.replyCount > 0 && replies === null && (
          <button type="button" className="link-button" onClick={() => void loadReplies()} disabled={loading}>
            {loading
              ? 'Loading…'
              : `Show ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
          </button>
        )}
      </div>

      {replying && (
        <CommentForm
          postId={postId}
          surface={surface}
          parentId={comment.id}
          onAdded={() => onCountChange(1)}
          placeholder={`Reply to ${comment.author.username}…`}
          onDone={async () => {
            setReplying(false);
            // show the branch this reply just joined, rather than leaving the
            // reader to guess where it went
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
  /** fired once the server has actually taken it */
  onAdded: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(describeError(res.error));
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
      {error && <div className="msg msg-error">{error}</div>}
      <div className="comment-form-actions">
        <Button type="submit" size="sm" disabled={busy || body.trim().length === 0}>
          {busy ? 'Posting…' : parentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </form>
  );
}
