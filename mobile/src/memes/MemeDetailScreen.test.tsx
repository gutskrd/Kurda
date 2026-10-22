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
vi.mock('expo-file-system/legacy', () => ({ FileSystemUploadType: { BINARY_CONTENT: 0 }, uploadAsync: async () => ({ status: 500, body: '' }) }));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import type { Comment, ImagePost } from './types';
import { MemeDetailScreen } from './MemeDetailScreen';

patchReactNativeWeb({ reduceMotion: true });

type Button = { text: string; style?: string; onPress?: () => void };
let alert: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  navigation.navigate.mockReset();
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const at = new Date(Date.now() - 2 * 3_600_000).toISOString();
const PICTURE: ImagePost = {
  id: 'i1',
  authorId: 'me',
  authorRole: 'user',
  imageMediaId: 'm1',
  imageUrl: 'https://cdn.test/i1.webp',
  caption: 'Newroz',
  category: 'meme',
  language: null,
  viewCount: 0,
  reactionCount: 0,
  commentCount: 1,
  createdAt: at,
  updatedAt: at,
};
const comment = (id: string, over: Partial<Comment> = {}): Comment => ({
  id,
  postId: 'i1',
  authorId: 'me',
  authorRole: 'user',
  author: { id: 'me', username: 'rojda', avatarUrl: null },
  parentCommentId: null,
  depth: 0,
  body: `comment ${id}`,
  status: 'visible',
  replyCount: 0,
  createdAt: at,
  updatedAt: at,
  ...over,
});

function open(routes: Parameters<typeof fakeClient>[0] = {}) {
  const client = fakeClient({
    'GET /images/i1': ok(PICTURE),
    'GET /posts/image/i1/engagement': ok({ engagement: { likes: 3, bookmarks: 0, reposts: 1, liked: false, bookmarked: false, reposted: false } }),
    'GET /images/i1/comments?sort=newest': ok({ comments: [comment('c1', { replyCount: 1 })] }),
    ...routes,
  });
  testAuth.client = client;
  const onExit = vi.fn();
  renderWithProviders(<MemeDetailScreen postId="i1" onExit={onExit} />);
  return { client, onExit };
}

describe('a picture’s comments', () => {
  it('say who and when in words, and open their replies from the picture’s own thread', async () => {
    open({ 'GET /images/comments/c1/replies?limit=50': ok({ comments: [comment('r1', { parentCommentId: 'c1', depth: 1, body: 'a reply' })] }) });
    expect(await screen.findByRole('button', { name: 'rojda — open profile' })).toBeTruthy();
    // the picture's own time, beside what kind of post it is at its top, then the comment's
    expect(screen.getByText(/ · 2h ago$/)).toBeTruthy();
    expect(screen.getAllByText('2h ago')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'View 1 reply' }));
    expect(await screen.findByText('a reply')).toBeTruthy();
  });

  it('delete your own through the picture’s path, and come back when that fails', async () => {
    const { client } = open({ 'DELETE /images/comments/c1': fail({ status: 500, kind: 'server' }) });
    await screen.findByText('comment c1');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const buttons = (alert.mock.calls[0] as [string, string, Button[]])[2];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(client.calls.find((c) => c.method === 'DELETE')?.path).toBe('/images/comments/c1');
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
    // it had a reply, so it was a placeholder for a moment; it is itself again
    expect(screen.getByText('comment c1')).toBeTruthy();
  });
});

describe('your own picture', () => {
  it('is deleted from its menu with the website’s call — no Edit, since a caption is not edited here — and the page closes', async () => {
    const { client, onExit } = open({ 'DELETE /images/i1': ok({ ok: true }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Post options' }));
    expect(screen.queryByRole('button', { name: 'Edit post' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    // the question, in the sheet (your own comment under it has a Delete of its own)
    const sheet = within(screen.getByRole('heading', { name: 'Delete this post?' }).parentElement!);
    expect(sheet.getByText('This can’t be undone.')).toBeTruthy();
    fireEvent.click(sheet.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    expect(client.calls.find((c) => c.method === 'DELETE')?.path).toBe('/images/i1');
  });
});
