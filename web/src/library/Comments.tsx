import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { Loading, ErrorState } from '../components/states';
import { PostAuthor, type Author } from './PostAuthor';

/**
 * Threaded comments on a library post.
 *
 * The server has supported replies since the table was created — `parent_comment_id`,
 * `depth`, `reply_count`, and an endpoint per branch — but nothing on the web
 * ever rendered any of it. This is that missing half.
 *
 * Replies load per branch on demand rather than the whole tree at once: a
 * popular thread is mostly collapsed, and fetching every descendant to show
 * three of them wastes the reader's time and the server's.
 */

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

export function Comments({ postId, commentCount }: { postId: string; commentCount: number }): React.JSX.Element {
  const { client, status } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<{ comments: Comment[] }>(`/library/posts/${postId}/comments?limit=${PAGE}`);
    if (res.ok) setComments(res.data.comments);
    else {
      setComments([]);
      setError(describeError(res.error));
    }
  }, [client, postId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="comments" aria-label="Comments">
      <h2 className="section-heading">
        {commentCount === 1 ? '1 comment' : `${commentCount.toLocaleString()} comments`}
      </h2>

      {status === 'signedIn' ? (
        <CommentForm postId={postId} onDone={load} placeholder="Add a comment…" />
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
            <CommentNode key={c.id} comment={c} postId={postId} onChanged={load} />
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
  onChanged,
}: {
  comment: Comment;
  postId: string;
  onChanged: () => Promise<void>;
}): React.JSX.Element {
  const { client, user, status } = useAuth();
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReplies = useCallback(async () => {
    setLoading(true);
    const res = await client.get<{ comments: Comment[] }>(`/library/comments/${comment.id}/replies?limit=${PAGE}`);
    if (res.ok) setReplies(res.data.comments);
    setLoading(false);
  }, [client, comment.id]);

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
              await client.delete(`/library/comments/${comment.id}`);
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
          parentId={comment.id}
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
            <CommentNode key={r.id} comment={r} postId={postId} onChanged={loadReplies} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Write a comment, or a reply when given a parent. */
function CommentForm({
  postId,
  parentId,
  placeholder,
  onDone,
}: {
  postId: string;
  parentId?: string;
  placeholder: string;
  onDone: () => Promise<void>;
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
    const res = await client.post(`/library/posts/${postId}/comments`, {
      body: text,
      ...(parentId ? { parentId } : {}),
    });
    setBusy(false);
    if (res.ok) {
      setBody('');
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
