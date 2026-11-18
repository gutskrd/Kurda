import { useCallback, useRef, useState } from 'react';
import { Alert, type TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { notReached } from '../api/errors';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { useSendErrorAlert } from '../reports/SendError';
import { THREAD_CALLS } from './api';
import {
  addToThread,
  authorOf,
  mergeBranch,
  removeFromThread,
  restoreToThread,
  updateComment,
  withdrawFromThread,
  type CommentSurface,
  type ThreadComment,
  type ThreadState,
} from './thread';

/** The comment a reply is going to, and the name the composer shows for it. */
export interface ReplyTarget {
  id: string;
  name: string;
}

/** The result of a page's own send: the accepted comment, or why it was refused. */
export type SendOutcome =
  | { ok: true; comment: ThreadComment }
  | { ok: false; title: string; error: ApiError | { message: string; limited?: boolean } };

export interface CommentThread {
  state: ThreadState;
  /** The branches whose replies are on their way. */
  loadingReplies: readonly string[];
  replyingTo: ReplyTarget | null;
  /** The composer's field, so "Reply" can put the cursor in it. */
  inputRef: React.RefObject<TextInput | null>;
  load: () => Promise<void>;
  showReplies: (commentId: string) => Promise<void>;
  reply: (c: ThreadComment) => void;
  cancelReply: () => void;
  confirmDelete: (c: ThreadComment) => void;
  /**
   * Add a comment to the thread at once and send it. `request` sends it (the page knows whether a voice note
   * uploads first) and is given the parent comment, if any. Returns false when refused, by which time the comment
   * is removed and the reason shown; one the server was not reached for stays as not sent, and counts as kept.
   */
  send: (draft: CommentDraft, request: (parentId: string | undefined) => Promise<SendOutcome>) => Promise<boolean>;
  /** A not-sent comment, sent again. */
  retry: (c: ThreadComment) => void;
  /** A not-sent comment, taken back out; its words go back to the composer. */
  discard: (c: ThreadComment) => void;
}

/** What a comment says: its words, a voice note, or both. */
export interface CommentDraft {
  body: string | null;
  audioUrl?: string | null;
}

/**
 * A post's comment thread: loading, opening reply branches, replying and deleting your own. Both writes are
 * optimistic and rolled back with the reason when the server refuses; a comment the server was not reached for stays
 * as "Not sent" with Try again and Cancel, as on the website. `onCountChange` keeps the page's "N comments" in step;
 * `onWordsBack` puts a comment's words back in the composer when it is cancelled or refused on a retry.
 */
export function useCommentThread(
  surface: CommentSurface,
  postId: string,
  onCountChange: (delta: number) => void,
  onWordsBack?: (draft: CommentDraft) => void,
): CommentThread {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const showSendError = useSendErrorAlert();
  const calls = THREAD_CALLS[surface];

  const [state, setState] = useState<ThreadState>({ top: null, replies: {} });
  const [loadingReplies, setLoadingReplies] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  // Read inside the writes, which must see the current thread rather than the one at creation.
  const stateRef = useRef(state);
  stateRef.current = state;
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;
  const wordsBack = useRef(onWordsBack);
  wordsBack.current = onWordsBack;
  const sent = useRef(0);
  // What each not-sent comment needs to go again: its request, and the comment it answers.
  const unsent = useRef(new Map<string, { request: (parentId: string | undefined) => Promise<SendOutcome>; parent: ReplyTarget | null }>());

  const load = useCallback(async () => {
    const res = await calls.list(client, postId);
    if (!res.ok) return;
    // Anything still on its way stays on top of what the server knows so far; one sent from here keeps its row.
    setState((prev) => {
      const local = new Map((prev.top ?? []).filter((c) => c.localId).map((c) => [c.id, c.localId]));
      const fresh = res.data.comments.map((c) => (local.has(c.id) ? { ...c, localId: local.get(c.id) } : c));
      return { top: [...(prev.top ?? []).filter((c) => c.pending), ...fresh], replies: {} };
    });
  }, [calls, client, postId]);

  const showReplies = useCallback(
    async (commentId: string) => {
      setLoadingReplies((ids) => [...ids, commentId]);
      const res = await calls.replies(client, commentId);
      setLoadingReplies((ids) => ids.filter((id) => id !== commentId));
      // A failed load leaves "View N replies" in place to try again.
      if (!res.ok) return;
      setState((prev) => ({ ...prev, replies: { ...prev.replies, [commentId]: mergeBranch(res.data.comments, prev.replies[commentId]) } }));
    },
    [calls, client],
  );

  const reply = useCallback(
    (c: ThreadComment) => {
      setReplyingTo({ id: c.id, name: authorOf(c, user).username });
      inputRef.current?.focus();
    },
    [user],
  );

  const cancelReply = useCallback(() => setReplyingTo(null), []);

  /** Send a comment already in the thread: true once the server has it or it waits as not sent, false when refused. */
  const deliver = useCallback(
    async (pending: ThreadComment, parent: ReplyTarget | null, request: (parentId: string | undefined) => Promise<SendOutcome>): Promise<boolean> => {
      const res = await request(parent?.id);
      if (!res.ok && 'kind' in res.error && notReached(res.error)) {
        unsent.current.set(pending.id, { request, parent });
        setState((prev) => updateComment(prev, pending.id, (c) => ({ ...c, failed: true })));
        haptic('error');
        return true;
      }
      unsent.current.delete(pending.id);
      if (!res.ok) {
        setState((prev) => withdrawFromThread(prev, pending));
        countRef.current(-1);
        // Back to replying to the same person, unless another reply was started meanwhile.
        if (parent) setReplyingTo((current) => current ?? parent);
        haptic('error');
        showSendError(res.title, res.error);
        return false;
      }
      // The library's answer has no author on it; it is you.
      const taken = { ...res.comment, author: res.comment.author ?? pending.author, localId: pending.id };
      setState((prev) => updateComment(prev, pending.id, () => taken));
      return true;
    },
    [showSendError],
  );

  const send = useCallback<CommentThread['send']>(
    async (draft, request) => {
      if (!user) return false;
      const parent = replyingTo;
      const parentRow = parent ? findComment(stateRef.current, parent.id) : null;
      const pending: ThreadComment = {
        id: `pending-${++sent.current}`,
        postId,
        authorId: user.id,
        authorRole: 'user',
        author: authorOf({ authorId: user.id }, user),
        parentCommentId: parent?.id ?? null,
        depth: parentRow ? parentRow.depth + 1 : 0,
        body: draft.body,
        audioUrl: draft.audioUrl ?? null,
        status: 'visible',
        replyCount: 0,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      haptic('tap');
      setReplyingTo(null);
      setState((prev) => addToThread(prev, pending));
      countRef.current(1);
      // A reply into an unopened branch opens it, so the reply lands among the others.
      if (parent && parentRow && parentRow.replyCount > 0 && !(parent.id in stateRef.current.replies)) {
        void showReplies(parent.id);
      }

      return deliver(pending, parent, request);
    },
    [user, replyingTo, postId, showReplies, deliver],
  );

  const retry = useCallback(
    (c: ThreadComment) => {
      const held = unsent.current.get(c.id);
      if (!held) return;
      setState((prev) => updateComment(prev, c.id, (x) => ({ ...x, failed: false })));
      void deliver({ ...c, failed: false }, held.parent, held.request).then((kept) => {
        if (!kept) wordsBack.current?.({ body: c.body, audioUrl: c.audioUrl });
      });
    },
    [deliver],
  );

  const discard = useCallback((c: ThreadComment) => {
    if (!unsent.current.delete(c.id)) return;
    setState((prev) => withdrawFromThread(prev, c));
    countRef.current(-1);
    wordsBack.current?.({ body: c.body, audioUrl: c.audioUrl });
  }, []);

  const remove = useCallback(
    async (c: ThreadComment) => {
      const { removal } = removeFromThread(stateRef.current, c.id);
      if (!removal) return;
      setState((prev) => removeFromThread(prev, c.id).state);
      setReplyingTo((current) => (current?.id === c.id ? null : current));
      countRef.current(-1);
      const res = await calls.remove(client, c.id);
      if (res.ok) return;
      setState((prev) => restoreToThread(prev, removal));
      countRef.current(1);
      haptic('error');
      showSendError(t('comments.deleteFailed'), res.error);
    },
    [calls, client, showSendError, t],
  );

  const confirmDelete = useCallback(
    (c: ThreadComment) => {
      Alert.alert(t('comments.deleteTitle'), t('common.cantUndo'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => void remove(c) },
      ]);
    },
    [remove, t],
  );

  return { state, loadingReplies, replyingTo, inputRef, load, showReplies, reply, cancelReply, confirmDelete, send, retry, discard };
}

function findComment(state: ThreadState, id: string): ThreadComment | null {
  for (const list of [state.top ?? [], ...Object.values(state.replies)]) {
    const found = list.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}
