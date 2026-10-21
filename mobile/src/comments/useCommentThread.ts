import { useCallback, useRef, useState } from 'react';
import { Alert, type TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
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

/** What a page's own send comes back with: the comment the server took, or what to say about why not. */
export type SendOutcome =
  | { ok: true; comment: ThreadComment }
  | { ok: false; title: string; error: ApiError | { message: string; limited?: boolean } };

export interface CommentThread {
  state: ThreadState;
  /** the branches whose replies are on their way */
  loadingReplies: readonly string[];
  replyingTo: ReplyTarget | null;
  /** the composer's field, so "Reply" can put the cursor in it */
  inputRef: React.RefObject<TextInput | null>;
  load: () => Promise<void>;
  showReplies: (commentId: string) => Promise<void>;
  reply: (c: ThreadComment) => void;
  cancelReply: () => void;
  confirmDelete: (c: ThreadComment) => void;
  /**
   * Put a comment on the thread at once and send it. `request` does the
   * sending (the page knows whether there is a voice note to upload first)
   * and is told the comment it answers, if any. False when it was refused,
   * by which time it is off the thread again and the reason has been said.
   */
  send: (
    draft: { body: string | null; audioUrl?: string | null },
    request: (parentId: string | undefined) => Promise<SendOutcome>,
  ) => Promise<boolean>;
}

/**
 * A post's comment thread, as the post's page uses it: loading it, opening
 * a branch of replies, replying, and deleting your own.
 *
 * Both writes are drawn before the server answers. A comment appears the
 * moment it is sent and a deleted one goes the moment it is confirmed —
 * waiting on the network for either made the thread feel broken on a slow
 * connection — and either is put back the way it was, with the reason, when
 * the server says no. `onCountChange` keeps the page's "N comments" in step.
 */
export function useCommentThread(
  surface: CommentSurface,
  postId: string,
  onCountChange: (delta: number) => void,
): CommentThread {
  const { client, user } = useAuth();
  const { t } = useI18n();
  const showSendError = useSendErrorAlert();
  const calls = THREAD_CALLS[surface];

  const [state, setState] = useState<ThreadState>({ top: null, replies: {} });
  const [loadingReplies, setLoadingReplies] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  // read inside the writes, which must see the thread as it is now rather
  // than as it was when they were created
  const stateRef = useRef(state);
  stateRef.current = state;
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;
  const sent = useRef(0);

  const load = useCallback(async () => {
    const res = await calls.list(client, postId);
    if (!res.ok) return;
    // anything still on its way stays on top of what the server knows so far
    setState((prev) => ({ top: [...(prev.top ?? []).filter((c) => c.pending), ...res.data.comments], replies: {} }));
  }, [calls, client, postId]);

  const showReplies = useCallback(
    async (commentId: string) => {
      setLoadingReplies((ids) => [...ids, commentId]);
      const res = await calls.replies(client, commentId);
      setLoadingReplies((ids) => ids.filter((id) => id !== commentId));
      // a failed load leaves "View N replies" where it was, to be tried again
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
      // a reply to a branch nobody has opened yet opens it, so the reply
      // lands among the others instead of standing there alone
      if (parent && parentRow && parentRow.replyCount > 0 && !(parent.id in stateRef.current.replies)) {
        void showReplies(parent.id);
      }

      const res = await request(parent?.id);
      if (!res.ok) {
        setState((prev) => withdrawFromThread(prev, pending));
        countRef.current(-1);
        // back to replying to the same person, unless another reply was started meanwhile
        if (parent) setReplyingTo((current) => current ?? parent);
        haptic('error');
        showSendError(res.title, res.error);
        return false;
      }
      // the library's answer has no author on it; it is you
      const taken = { ...res.comment, author: res.comment.author ?? pending.author };
      setState((prev) => updateComment(prev, pending.id, () => taken));
      return true;
    },
    [user, replyingTo, postId, showReplies, showSendError],
  );

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

  return { state, loadingReplies, replyingTo, inputRef, load, showReplies, reply, cancelReply, confirmDelete, send };
}

function findComment(state: ThreadState, id: string): ThreadComment | null {
  for (const list of [state.top ?? [], ...Object.values(state.replies)]) {
    const found = list.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}
