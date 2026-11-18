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
import { useOutbox, type Unsent } from '../chat/useOutbox';
import { useOptimisticSend } from '../lib/optimistic';

/**
 * Threaded comments on a library post or a Dîmen picture. Both APIs have the same shape at different paths, so the
 * surfaces differ only by a table of URLs. Replies load per branch on demand, since a popular thread is mostly
 * collapsed. A comment written here shows at once, newest first, marked as sending, and is sent through the chat's
 * outbox (chat/useOutbox.ts): one the server was not reached for stays with a retry, one it refused leaves with the
 * reason and its words back in the box.
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
  /** The key it was drawn under while it was still being sent, kept so it is not drawn afresh once it arrives. */
  localKey?: string;
}

/** How deep replies may nest before they stop indenting. */
const MAX_INDENT = 4;
const PAGE = 20;

/** Keeps the drawing key of comments the list already holds when a fresh page of them arrives. */
function keepKeys(fresh: Comment[], held: Comment[] | null): Comment[] {
  const keys = new Map((held ?? []).filter((c) => c.localKey).map((c) => [c.id, c.localKey]));
  return fresh.map((c) => (keys.has(c.id) ? { ...c, localKey: keys.get(c.id) } : c));
}

/** Adds a delivered comment at the top, unless a reload already brought it. */
function withNew(list: Comment[] | null, comment: Comment): Comment[] {
  const held = list ?? [];
  return held.some((c) => c.id === comment.id) ? held : [comment, ...held];
}

/**
 * What the reader is writing in one box, and the comments from it still on their way, counted from the moment they are
 * sent. `delivered` gets the server's comment with the reader as its author (the answer carries none) and the key it
 * was drawn under; `refused` runs when one comes back to the box.
 */
function useCommentBox(
  surface: CommentSurface,
  postId: string,
  parentId: string | null,
  on: { delivered: (comment: Comment) => void; count: (delta: number) => void; refused?: () => void },
) {
  const { client, user } = useAuth();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const me: Author = { id: user?.id ?? '', username: user?.username ?? '', avatarUrl: user?.avatarUrl ?? null };
  const outbox = useOutbox<Omit<Comment, 'author'>>({
    post: (body) => client.post<Omit<Comment, 'author'>>(ROUTES[surface].thread(postId), { body, ...(parentId ? { parentId } : {}) }),
    onDelivered: (comment, localKey) => on.delivered({ ...comment, author: me, localKey }),
    onRefused: (refusal, body) => {
      on.count(-1);
      setError(refusal);
      setDraft((now) => now || body);
      on.refused?.();
    },
  });

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    setDraft('');
    on.count(1);
    outbox.send(text);
  };

  /** A comment still being sent, drawn like any other in the same place. */
  const asComment = (u: Unsent): Comment => ({
    id: u.id,
    postId,
    author: me,
    parentCommentId: parentId,
    depth: 0,
    body: u.body,
    status: 'visible',
    replyCount: 0,
    createdAt: u.createdAt,
    localKey: u.id,
  });

  return {
    draft,
    setDraft,
    error,
    send,
    // Newest first, as the thread reads.
    unsent: [...outbox.unsent].reverse().map((u) => ({ comment: asComment(u), pending: u.pending })),
    retry: outbox.retry,
    discard: (id: string) => {
      const body = outbox.discard(id);
      if (body === null) return;
      on.count(-1);
      setDraft((now) => now || body);
    },
  };
}

type CommentBox = ReturnType<typeof useCommentBox>;

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
  const onCountChange = useCallback((d: number) => setCount((n) => Math.max(0, n + d)), []);
  const box = useCommentBox(surface, postId, null, {
    delivered: (comment) => setComments((list) => withNew(list, comment)),
    count: onCountChange,
  });

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<{ comments: Comment[] }>(`${ROUTES[surface].thread(postId)}?limit=${PAGE}`);
    if (res.ok) setComments((held) => keepKeys(res.data.comments, held));
    else {
      setComments([]);
      setError(describeError(res.error, t));
    }
  }, [client, postId, surface]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = comments === null ? null : [...box.unsent, ...comments.map((comment) => ({ comment, pending: undefined }))];

  return (
    <section className="comments" aria-label={t('comments.title')}>
      <h2 className="section-heading">
        {count === 1 ? t('comments.countOne') : t('comments.count', { count: count.toLocaleString() })}
      </h2>

      {status === 'signedIn' ? <CommentForm box={box} placeholder={t('comments.add')} /> : <p className="muted">{t('comments.signInToJoin')}</p>}

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {shown === null ? (
        <CommentsSkeleton />
      ) : shown.length === 0 ? (
        <p className="muted comments-empty">{t('comments.empty')}</p>
      ) : (
        <ul className="comment-list">
          {shown.map(({ comment, pending }) => (
            <CommentNode
              key={comment.localKey ?? comment.id}
              comment={comment}
              pending={pending}
              box={pending ? box : undefined}
              postId={postId}
              surface={surface}
              onCountChange={onCountChange}
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
  pending,
  box,
  postId,
  surface,
  onCountChange,
}: {
  comment: Comment;
  /** Still on its way, or not sent; such a comment offers only a retry. */
  pending?: Unsent['pending'];
  /** The box a comment still on its way came from, for its retry. */
  box?: CommentBox;
  postId: string;
  surface: CommentSurface;
  /** +1 for a comment added anywhere in this branch, -1 for one removed. */
  onCountChange: (delta: number) => void;
}): React.JSX.Element {
  const t = useT();
  const { client, user, status } = useAuth();
  const sendShown = useOptimisticSend();
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Removed here: shown as the server will show it, a tombstone that keeps its replies, before it answers.
  const [removedHere, setRemovedHere] = useState(false);
  const replyBox = useCommentBox(surface, postId, comment.id, {
    delivered: (reply) => setReplies((list) => withNew(list, reply)),
    count: onCountChange,
    // The box closed as the reply went; it opens again with the words and the reason.
    refused: () => setReplying(true),
  });

  const loadReplies = useCallback(async () => {
    setLoading(true);
    const res = await client.get<{ comments: Comment[] }>(`${ROUTES[surface].replies(comment.id)}?limit=${PAGE}`);
    if (res.ok) setReplies((held) => keepKeys(res.data.comments, held));
    setLoading(false);
  }, [client, comment.id, surface]);

  const removed = comment.status === 'removed' || removedHere;
  const mine = comment.author.id === user?.id;
  const indent = Math.min(comment.depth, MAX_INDENT);
  const shownReplies = [...replyBox.unsent, ...(replies ?? []).map((reply) => ({ comment: reply, pending: undefined }))];

  return (
    <li className={`comment${pending ? ' is-pending' : ''}`} style={{ marginLeft: indent > 0 ? 0 : undefined }}>
      <PostAuthor
        author={comment.author}
        at={comment.createdAt}
        size="sm"
        trailing={
          !removed &&
          !pending && (
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

      {pending ? (
        <p className={`comment-actions comment-pending${pending === 'failed' ? ' is-failed' : ''}`} role="status">
          {pending === 'sending' ? (
            <span>{t('chat.sending')}</span>
          ) : (
            <>
              <span>{t('chat.notSent')}</span>
              <button type="button" className="link-button" onClick={() => box?.retry(comment.id)}>
                {t('common.retry')}
              </button>
              <button type="button" className="link-button" onClick={() => box?.discard(comment.id)}>
                {t('common.cancel')}
              </button>
            </>
          )}
        </p>
      ) : (
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
                setRemovedHere(true);
                onCountChange(-1);
                await sendShown(() => client.delete(ROUTES[surface].one(comment.id)), {
                  undo: () => {
                    setRemovedHere(false);
                    onCountChange(1);
                  },
                });
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
      )}

      {replying && (
        <CommentForm
          box={replyBox}
          placeholder={t('comments.replyTo', { name: comment.author.username })}
          onSent={() => {
            setReplying(false);
            // Open the branch the reply just joined.
            if (replies === null) void loadReplies();
          }}
        />
      )}

      {shownReplies.length > 0 && (
        <ul className="comment-list comment-replies">
          {shownReplies.map(({ comment: reply, pending: on }) => (
            <CommentNode
              key={reply.localKey ?? reply.id}
              comment={reply}
              pending={on}
              box={on ? replyBox : undefined}
              postId={postId}
              surface={surface}
              onCountChange={onCountChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Write a comment, or a reply when its box is a reply's. */
function CommentForm({ box, placeholder, onSent }: { box: CommentBox; placeholder: string; onSent?: () => void }): React.JSX.Element {
  const t = useT();
  const reply = Boolean(onSent);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!box.draft.trim()) return;
    box.send();
    onSent?.();
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <textarea
        className="input comment-input"
        rows={2}
        value={box.draft}
        maxLength={10_000}
        placeholder={placeholder}
        onChange={(e) => box.setDraft(e.target.value)}
        aria-label={placeholder}
      />
      <SendError error={box.error} />
      <div className="comment-form-actions">
        <Button type="submit" size="sm" disabled={box.draft.trim().length === 0}>
          {reply ? t('comments.reply') : t('comments.submit')}
        </Button>
      </div>
    </form>
  );
}
