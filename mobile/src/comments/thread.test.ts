import { describe, expect, it } from 'vitest';
import {
  addToThread,
  authorOf,
  mergeBranch,
  removeFromThread,
  restoreToThread,
  withdrawFromThread,
  type ThreadComment,
  type ThreadState,
} from './thread';

const c = (id: string, over: Partial<ThreadComment> = {}): ThreadComment => ({
  id,
  postId: 'p1',
  authorId: 'u1',
  authorRole: 'user',
  author: { id: 'u1', username: 'azad', avatarUrl: null },
  parentCommentId: null,
  depth: 0,
  body: id,
  status: 'visible',
  replyCount: 0,
  createdAt: '2026-10-20T12:00:00.000Z',
  ...over,
});

const thread = (top: ThreadComment[], replies: Record<string, ThreadComment[]> = {}): ThreadState => ({ top, replies });
const ids = (list: ThreadComment[] | null | undefined) => (list ?? []).map((x) => x.id);

describe('the thread, before the server answers', () => {
  it('puts a new comment on top and a reply at the end of its branch, opening it and counting it', () => {
    const start = thread([c('a'), c('b', { replyCount: 1 })], { b: [c('b1', { parentCommentId: 'b', depth: 1 })] });
    const withTop = addToThread(start, c('n'));
    expect(ids(withTop.top)).toEqual(['n', 'a', 'b']);

    const withReply = addToThread(start, c('r', { parentCommentId: 'b', depth: 1 }));
    expect(ids(withReply.replies.b)).toEqual(['b1', 'r']);
    expect(withReply.top?.find((x) => x.id === 'b')?.replyCount).toBe(2);

    // a branch nobody opened opens with the reply in it
    const opened = addToThread(start, c('r2', { parentCommentId: 'a', depth: 1 }));
    expect(ids(opened.replies.a)).toEqual(['r2']);
  });

  it('takes a refused comment back off, with the count it added', () => {
    const reply = c('r', { parentCommentId: 'b', depth: 1 });
    const after = withdrawFromThread(addToThread(thread([c('b', { replyCount: 1 })], { b: [] }), reply), reply);
    expect(ids(after.replies.b)).toEqual([]);
    expect(after.top?.[0]?.replyCount).toBe(1);
  });

  it('removes a comment, and a refused delete puts it back where it was', () => {
    const start = thread([c('a'), c('b'), c('c')]);
    const { state, removal } = removeFromThread(start, 'b');
    expect(ids(state.top)).toEqual(['a', 'c']);
    expect(ids(restoreToThread(state, removal!).top)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a removed comment with replies as a placeholder holding them up', () => {
    const start = thread([c('a', { replyCount: 1 })], { a: [c('a1', { parentCommentId: 'a', depth: 1 })] });
    const { state, removal } = removeFromThread(start, 'a');
    expect(state.top?.[0]).toMatchObject({ id: 'a', status: 'removed', body: null });
    expect(ids(state.replies.a)).toEqual(['a1']);
    expect(restoreToThread(state, removal!).top?.[0]).toMatchObject({ status: 'visible', body: 'a' });
  });

  it('removes a reply from its branch', () => {
    const start = thread([c('a', { replyCount: 2 })], { a: [c('a1'), c('a2')] });
    const { state, removal } = removeFromThread(start, 'a2');
    expect(ids(state.replies.a)).toEqual(['a1']);
    expect(removal).toMatchObject({ list: 'a', index: 1, tombstoned: false });
    expect(ids(restoreToThread(state, removal!).replies.a)).toEqual(['a1', 'a2']);
  });

  it('keeps a reply sent while its branch was loading', () => {
    expect(ids(mergeBranch([c('a1'), c('a2')], [c('pending-1')]))).toEqual(['a1', 'a2', 'pending-1']);
    // and does not draw one the server already has twice
    expect(ids(mergeBranch([c('a1'), c('mine')], [c('mine')]))).toEqual(['a1', 'mine']);
  });
});

describe('authorOf', () => {
  const me = { id: 'me', username: 'rojda', profilePhotoUrl: 'https://cdn.test/me.webp' };
  it('uses the author the server sent', () => {
    expect(authorOf(c('a'), me)).toEqual({ id: 'u1', username: 'azad', avatarUrl: null });
  });
  it('fills in your own comment, which the library answers without one', () => {
    expect(authorOf({ authorId: 'me' }, me)).toEqual({ id: 'me', username: 'rojda', avatarUrl: 'https://cdn.test/me.webp' });
  });
});
