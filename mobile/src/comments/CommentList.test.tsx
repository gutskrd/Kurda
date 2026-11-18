// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { StyleSheet, type ViewStyle } from 'react-native';
import { cleanup, waitFor } from '@testing-library/react';
import { forgetReach, pressablePropsOf, reachOf } from '../testing/reach';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { testAuth } from '../reports/testing/auth';
import { CommentList } from './CommentList';
import type { ThreadComment, ThreadState } from './thread';
import type { CommentThread } from './useCommentThread';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  testAuth.user = { ...testAuth.user, id: 'me' };
});
afterEach(() => {
  cleanup();
  forgetReach();
  localStorage.clear();
  vi.restoreAllMocks();
});

/*
 * The gaps a thread is laid out with, which reaches share: Reply to Report, picture to text, one comment to the
 * next, and the text column's 2 between lines.
 */
const ACTIONS_GAP = 16;
const FACE_GAP = 8;
const COMMENT_TOP = 12;
const LINE_GAP = 2;

interface Slop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const comment = (over: Partial<ThreadComment> = {}): ThreadComment => ({
  id: 'c1',
  postId: 'p1',
  authorId: 'u2',
  authorRole: 'member',
  author: { id: 'u2', username: 'rojda', avatarUrl: null },
  parentCommentId: null,
  depth: 0,
  body: 'Pir xweş e',
  status: 'visible',
  replyCount: 0,
  createdAt: '2026-10-19T10:00:00Z',
  ...over,
});

function thread(state: ThreadState): CommentThread {
  return {
    state,
    loadingReplies: [],
    replyingTo: null,
    inputRef: { current: null },
    load: vi.fn(async () => undefined),
    showReplies: vi.fn(async () => undefined),
    reply: vi.fn(),
    cancelReply: vi.fn(),
    confirmDelete: vi.fn(),
    send: vi.fn(async () => true),
    retry: vi.fn(),
    discard: vi.fn(),
  };
}

function show(state: ThreadState): void {
  renderWithProviders(<CommentList thread={thread(state)} onReport={vi.fn()} />);
}

const slop = (name: string): Slop => ({ top: 0, bottom: 0, left: 0, right: 0, ...(reachOf(name) as Partial<Slop>) });

/** The style a pressable is drawn with at rest, flattened. */
function drawn(name: string): ViewStyle {
  const { style } = pressablePropsOf(name);
  return StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {};
}

describe('a comment’s controls', () => {
  it('each reach a fingertip’s 44 at least, Reply and Report meeting in the middle of the gap between them', () => {
    show({ top: [comment({ replyCount: 2 })], replies: {} });
    const reply = slop('comment-reply-c1');
    const report = slop('comment-report-c1');
    expect(reply).toEqual({ top: 12, bottom: 8, left: FACE_GAP / 2, right: 8 });
    expect(report).toEqual({ top: 12, bottom: 8, left: 8, right: 8 });
    // A 16pt line drawn 4 taller above and below, then reached to 44.
    expect(drawn('comment-reply-c1').paddingVertical).toBe(4);
    expect(16 + 2 * 4 + reply.top + reply.bottom).toBe(44);
    expect(reply.right + report.left).toBe(ACTIONS_GAP);
  });

  it('keeps “Show replies” clear of Reply above it', () => {
    show({ top: [comment({ replyCount: 2 })], replies: {} });
    const more = slop('comment-more-c1');
    expect(more).toEqual({ top: 8, bottom: 8, left: 0, right: 0 });
    const apart = LINE_GAP + Number(drawn('comment-more-c1').marginTop);
    expect(slop('comment-reply-c1').bottom + more.top).toBeLessThanOrEqual(apart);
    // Drawn 24 tall (its line and 4 above and below), reached to 40.
    expect(16 + 2 * Number(drawn('comment-more-c1').paddingVertical) + more.top + more.bottom).toBe(40);
  });

  it('shares the gap between the picture and the words, and reaches no further up than the line above leaves it', () => {
    show({ top: [comment()], replies: {} });
    const face = slop('comment-face-c1');
    const name = slop('rojda — open profile');
    // A 32pt picture, a fingertip up and down and away from the words; half the gap toward them.
    expect(face).toEqual({ top: 8, bottom: 8, left: 8, right: FACE_GAP / 2 });
    expect(name).toEqual({ top: 4, bottom: 12, left: 4, right: 4 });
    expect(face.right + name.left).toBe(FACE_GAP);
    expect(slop('comment-reply-c1').left + face.right).toBe(FACE_GAP);
  });

  it('starts the next comment, and a reply, where the last line’s reach ends', () => {
    show({
      top: [comment({ replyCount: 1 }), comment({ id: 'c2', author: { id: 'u3', username: 'azad', avatarUrl: null }, authorId: 'u3' })],
      replies: { c1: [comment({ id: 'r1', parentCommentId: 'c1', depth: 1 })] },
    });
    // The reply's picture sits under the line of Reply and Report it answers.
    expect(slop('comment-face-r1')).toEqual({ top: 4, bottom: 12, left: 12, right: FACE_GAP / 2 });
    expect(slop('comment-reply-c1').bottom + slop('comment-face-r1').top).toBe(COMMENT_TOP);
    // The next comment's name, under the reply's last line.
    expect(slop('comment-reply-r1').bottom + slop('azad — open profile').top).toBe(COMMENT_TOP);
    // A reply's open branch has no “Show replies” of its own.
    expect(() => reachOf('comment-more-c1')).toThrow();
  });

  it('gives your own Delete the same reach as Report', () => {
    show({ top: [comment({ authorId: 'me', author: { id: 'me', username: 'rojda', avatarUrl: null } })], replies: {} });
    expect(slop('comment-delete-c1')).toEqual({ top: 12, bottom: 8, left: 8, right: 8 });
  });

  it('mirrors the picture’s side and Reply’s in Soranî, where a comment starts on the right', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    show({ top: [comment()], replies: {} });
    await waitFor(() => expect(slop('comment-face-c1')).toEqual({ top: 8, bottom: 8, left: FACE_GAP / 2, right: 8 }));
    expect(slop('comment-reply-c1')).toEqual({ top: 12, bottom: 8, left: 8, right: FACE_GAP / 2 });
  });
});
