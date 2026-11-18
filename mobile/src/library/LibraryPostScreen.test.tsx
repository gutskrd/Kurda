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
// The voice recorder and player render, but nothing here records or plays; a test can have the microphone refused.
const microphone = vi.hoisted(() => ({ granted: true }));
vi.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: async () => ({ granted: microphone.granted, canAskAgain: false }),
  getRecordingPermissionsAsync: async () => ({ granted: microphone.granted, canAskAgain: false }),
  setAudioModeAsync: async () => undefined,
  useAudioRecorder: () => ({ prepareToRecordAsync: async () => undefined, record: () => undefined, stop: async () => undefined, uri: null }),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  useAudioPlayer: () => ({ play: () => undefined, pause: () => undefined, seekTo: async () => undefined }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
}));
vi.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  uploadAsync: async () => ({ status: 500, body: '' }),
}));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import type { ApiResult } from '../api/types';
import { onPostDeleted, type DeletedPost } from '../composer/postDeleted';
import type { LibraryComment, LibraryPost } from './types';
import { LibraryPostScreen } from './LibraryPostScreen';
import { watchNotices } from '../testing/notices';

patchReactNativeWeb({ reduceMotion: true });

type Button = { text: string; style?: string; onPress?: () => void };
let alert: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  navigation.navigate.mockReset();
  microphone.granted = true;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda', profilePhotoUrl: null };
  alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const POST: LibraryPost = {
  id: 'p1',
  authorId: 'me',
  authorRole: 'user',
  type: 'story',
  title: 'Rovî û Gur',
  body: 'Carekê hebû…',
  audioMediaId: null,
  audioUrl: null,
  language: 'ku',
  status: 'published',
  viewCount: 3,
  commentCount: 3,
  createdAt: ago(60 * MIN),
  updatedAt: ago(60 * MIN),
  publishedAt: ago(60 * MIN),
  media: [],
};

const azad = { id: 'u-azad', username: 'azad', avatarUrl: 'https://cdn.test/azad.webp' };
const me = { id: 'me', username: 'rojda', avatarUrl: null };

const comment = (id: string, over: Partial<LibraryComment> = {}): LibraryComment => ({
  id,
  postId: 'p1',
  authorId: azad.id,
  authorRole: 'user',
  author: azad,
  parentCommentId: null,
  depth: 0,
  body: `comment ${id}`,
  audioMediaId: null,
  audioUrl: null,
  status: 'visible',
  replyCount: 0,
  createdAt: ago(5 * MIN),
  updatedAt: ago(5 * MIN),
  ...over,
});

const THREAD = 'GET /library/posts/p1/comments?sort=newest';
const REPLIES = 'GET /library/comments/c1/replies?limit=50';

function open(routes: Parameters<typeof fakeClient>[0] = {}, comments: LibraryComment[] = []) {
  const client = fakeClient({ 'GET /library/posts/p1': ok(POST), [THREAD]: ok({ comments }), ...routes });
  testAuth.client = client;
  const onExit = vi.fn();
  renderWithProviders(<LibraryPostScreen postId="p1" onExit={onExit} />);
  return { client, onExit };
}

/** A reply the test holds back, to look at the thread while it is on its way. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** The buttons of the one alert shown, and its title and message. */
function shownAlert(): { title: string; message: string; buttons: Button[] } {
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alert.mock.calls[0] as [string, string, Button[] | undefined];
  return { title, message, buttons: buttons ?? [] };
}

const type = (text: string) => fireEvent.change(screen.getByPlaceholderText('Add a comment…'), { target: { value: text } });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

describe('the post’s author', () => {
  it('says who wrote the post and when, under its title, and opens their profile', async () => {
    open({ 'GET /library/posts/p1': ok({ ...POST, authorId: azad.id, author: azad }) }, []);
    const by = await screen.findByTestId('library-post-author');
    expect(by.getAttribute('aria-label')).toBe('azad — open profile');
    expect(by.textContent).toContain('azad');
    expect(by.textContent).toContain('1h ago');
    fireEvent.click(by);
    expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', { userId: 'u-azad' });
  });
});

/* The website's page has the wall's row under the post and says how often it was read; so does the phone's. */
describe('the post’s own row', () => {
  const ENGAGEMENT = 'GET /posts/library/p1/engagement';
  const counts = { likes: 4, bookmarks: 1, reposts: 2, liked: false, bookmarked: false, reposted: false };

  it('says how often it was read, and shows its likes, reposts and comments as the wall does', async () => {
    open({ [ENGAGEMENT]: ok({ engagement: counts }) });
    expect(await screen.findByText('3 reads')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Like (4)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Repost (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '3 comments (3)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('likes at once, before the server answers, and keeps the server’s totals after', async () => {
    const reply = deferred<ApiResult<unknown>>();
    const { client } = open({ [ENGAGEMENT]: ok({ engagement: counts }), 'POST /posts/library/p1/like': () => reply.promise });
    fireEvent.click(await screen.findByRole('button', { name: 'Like (4)' }));
    expect(screen.getByRole('button', { name: 'Unlike (5)' })).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/posts/library/p1/like')?.body).toEqual({ on: true });
    await act(async () => reply.resolve(ok({ on: true, engagement: { ...counts, likes: 6, liked: true } })));
    expect(await screen.findByRole('button', { name: 'Unlike (6)' })).toBeTruthy();
  });

  it('still shows the post, with no counts, when its numbers could not be read', async () => {
    open();
    expect(await screen.findByText('Rovî û Gur')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Like' })).toBeTruthy();
  });

  it('sends the post to a friend in chat from Share, saying who it went to', async () => {
    const { client } = open({
      [ENGAGEMENT]: ok({ engagement: counts }),
      'GET /friends?limit=500': ok({ total: 1, friends: [{ userId: 'u-azad', username: 'azad', displayName: null, avatarUrl: null, online: false, lastSeenAt: null }] }),
      'POST /chat/u-azad/messages': ok({ id: 'm1' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Share this post' }));
    expect(screen.getByRole('button', { name: 'Share…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Message azad' }));
    expect(await screen.findByText('Sent to azad.')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/chat/u-azad/messages')?.body).toEqual({ body: 'Rovî û Gur\nhttps://hevalo.app/app/library/p1' });
  });

  it('brings the friends back with why, when the message did not go', async () => {
    open({
      [ENGAGEMENT]: ok({ engagement: counts }),
      'GET /friends?limit=500': ok({ total: 1, friends: [{ userId: 'u-azad', username: 'azad', displayName: null, avatarUrl: null, online: false, lastSeenAt: null }] }),
      'POST /chat/u-azad/messages': fail({ status: 403, code: 'NOT_FRIENDS', message: 'Not friends' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Share this post' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Message azad' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Sent to azad.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Message azad' })).toBeTruthy();
  });
});

describe('a comment’s author', () => {
  it('shows who wrote it, with their picture and how long ago in words, and opens their profile', async () => {
    open({}, [comment('c1')]);
    const name = await screen.findByRole('button', { name: 'azad — open profile' });
    expect(name.textContent).toBe('azad');
    // Their own picture beside the name, not a monogram. The picture is hidden from screen readers, which get the
    // name; react-native-web draws it as a box and then the browser's image inside, both under that name.
    const photos = screen.getAllByRole('img', { name: 'azad avatar', hidden: true });
    expect(photos.map((p) => p.textContent)).toEqual(photos.map(() => ''));
    expect(photos.some((p) => p.getAttribute('src') === azad.avatarUrl)).toBe(true);
    expect(screen.queryByText('U-')).toBeNull();
    expect(screen.getByText('5m ago')).toBeTruthy();
    fireEvent.click(name);
    expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', { userId: 'u-azad' });
  });

  it('names your own comment after you, though the server answers a new one without an author', async () => {
    const { client } = open({
      'POST /library/posts/p1/comments': ok(comment('new', { author: undefined, authorId: 'me', body: 'Spas!', createdAt: new Date().toISOString() })),
    });
    await screen.findByText('No comments yet.');
    type('Spas!');
    send();
    await waitFor(() => expect(screen.getByRole('button', { name: 'rojda — open profile' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText('just now')).toBeTruthy());
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ body: 'Spas!' });
  });
});

describe('posting a comment', () => {
  it('shows it at once, and counts it, before the server has answered', async () => {
    const reply = deferred<ApiResult<LibraryComment>>();
    open({ 'POST /library/posts/p1/comments': () => reply.promise }, [comment('c1')]);
    await screen.findByText('comment c1');
    expect(screen.getByText('3 comments')).toBeTruthy();
    type('Pir xweş e');
    send();
    expect(await screen.findByText('Pir xweş e')).toBeTruthy();
    expect(screen.getByText('Posting…')).toBeTruthy();
    expect(screen.getByText('4 comments')).toBeTruthy();
    const row = screen.getByText('Pir xweş e');
    await act(async () => reply.resolve(ok(comment('c9', { authorId: 'me', author: me, body: 'Pir xweş e', createdAt: new Date().toISOString() }))));
    await waitFor(() => expect(screen.queryByText('Posting…')).toBeNull());
    // The server's copy takes the same row, which is never drawn afresh.
    expect(screen.getByText('Pir xweş e')).toBe(row);
  });

  it('takes it back off and says why when the server refuses it, keeping what was written', async () => {
    open({ 'POST /library/posts/p1/comments': fail({ status: 422, message: 'refused' }) }, [comment('c1')]);
    await screen.findByText('comment c1');
    type('Ev dê neçe');
    send();
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(shownAlert().title).toBe('Couldn’t comment');
    expect(screen.queryByText('Ev dê neçe', { ignore: 'textarea' })).toBeNull();
    expect(screen.getByText('3 comments')).toBeTruthy();
    expect((screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement).value).toBe('Ev dê neçe');
  });

  it('is written and sent as ever when the microphone is refused for a voice note', async () => {
    microphone.granted = false;
    const { client } = open({
      'POST /library/posts/p1/comments': ok(comment('new', { author: undefined, authorId: 'me', body: 'Spas!', createdAt: new Date().toISOString() })),
    });
    await screen.findByText('No comments yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    // Where things stand and what can be done instead; nobody is told to allow anything.
    const said = shownAlert();
    expect(said.title).toBe('Microphone needed');
    expect(said.message).toBe('The microphone is off for Hevalo. You can turn it on in your phone’s settings, or write a comment instead.');

    // Nothing is left recording or busy, and the words go as they always did.
    expect(screen.getByRole('button', { name: 'Record a voice note' }).getAttribute('aria-disabled')).not.toBe('true');
    type('Spas!');
    send();
    await waitFor(() => expect(screen.getByRole('button', { name: 'rojda — open profile' })).toBeTruthy());
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ body: 'Spas!' });
  });
});

describe('replies', () => {
  it('opens a branch of replies on demand', async () => {
    const { client } = open({ [REPLIES]: ok({ comments: [comment('r1', { parentCommentId: 'c1', depth: 1, body: 'first reply' }), comment('r2', { parentCommentId: 'c1', depth: 1, body: 'second reply' })] }) }, [
      comment('c1', { replyCount: 2 }),
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'View 2 replies' }));
    expect(await screen.findByText('first reply')).toBeTruthy();
    expect(screen.getByText('second reply')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View 2 replies' })).toBeNull();
    expect(client.calls.filter((c) => c.path === '/library/comments/c1/replies?limit=50')).toHaveLength(1);
  });

  it('replies to a comment: says to whom, can be called off, and sends the reply under it', async () => {
    const { client } = open(
      {
        [REPLIES]: ok({ comments: [comment('r1', { parentCommentId: 'c1', depth: 1, body: 'an older reply' })] }),
        'POST /library/posts/p1/comments': (body) =>
          ok(comment('r2', { parentCommentId: 'c1', depth: 1, authorId: 'me', author: undefined, body: (body as { body: string }).body })),
      },
      [comment('c1', { replyCount: 1 })],
    );
    await screen.findByText('comment c1');

    // ✕ goes back to commenting on the post.
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to @azad')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText('Replying to @azad')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    type('Erê, rast e');
    send();
    // The branch opens with the reply in it, among the ones already there.
    expect(await screen.findByText('Erê, rast e')).toBeTruthy();
    expect(await screen.findByText('an older reply')).toBeTruthy();
    expect(screen.queryByText('Replying to @azad')).toBeNull();
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ body: 'Erê, rast e', parentId: 'c1' });
    await waitFor(() => expect(screen.queryByText('Posting…')).toBeNull());
    expect(screen.getByText('4 comments')).toBeTruthy();
  });

  it('goes back to replying to the same person when the reply is refused', async () => {
    open({ 'POST /library/posts/p1/comments': fail({ status: 422, message: 'refused' }) }, [comment('c1')]);
    await screen.findByText('comment c1');
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    type('Erê');
    send();
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(screen.getByText('Replying to @azad')).toBeTruthy();
    expect(screen.queryByText('Erê', { ignore: 'textarea' })).toBeNull();
    expect((screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement).value).toBe('Erê');
  });
});

/* As on the website: a comment the server was not reached for stays where it was written, for Try again or Cancel. */
describe('a comment that did not go', () => {
  it('stays in the thread as not sent, counted, and goes on Try again', async () => {
    let tries = 0;
    const { client } = open(
      {
        'POST /library/posts/p1/comments': () =>
          tries++ === 0
            ? fail({ kind: 'network', status: 0, message: 'offline' })
            : ok(comment('c9', { authorId: 'me', author: me, body: 'Pir xweş e', createdAt: new Date().toISOString() })),
      },
      [comment('c1')],
    );
    await screen.findByText('comment c1');
    type('Pir xweş e');
    send();
    expect(await screen.findByText('Not sent')).toBeTruthy();
    expect(screen.getByText('Pir xweş e', { ignore: 'textarea' })).toBeTruthy();
    expect(screen.getByText('4 comments')).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('Not sent')).toBeNull());
    expect(client.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(screen.getByText('4 comments')).toBeTruthy();
  });

  it('leaves on Cancel, uncounted, its words back in the composer', async () => {
    open({ 'POST /library/posts/p1/comments': fail({ kind: 'network', status: 0, message: 'offline' }) }, [comment('c1')]);
    await screen.findByText('comment c1');
    type('Pir xweş e');
    send();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getByText('3 comments')).toBeTruthy();
    expect((screen.getByPlaceholderText('Add a comment…') as HTMLTextAreaElement).value).toBe('Pir xweş e');
  });
});

describe('deleting your own comment', () => {
  const mine = comment('c2', { authorId: 'me', author: me, body: 'my words' });

  it('is offered on yours and not on anybody else’s, which can be reported instead', async () => {
    open({}, [comment('c1'), mine]);
    await screen.findByText('my words');
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Report this comment' })).toHaveLength(1);
  });

  it('asks first, in the destructive style, then takes it away at once', async () => {
    const answer = deferred<ApiResult<unknown>>();
    const { client } = open({ 'DELETE /library/comments/c2': () => answer.promise }, [comment('c1'), mine]);
    await screen.findByText('my words');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const { title, message, buttons } = shownAlert();
    expect(title).toBe('Delete this comment?');
    expect(message).toBe('This can’t be undone.');
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    // Nothing is sent until it is confirmed.
    expect(client.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(screen.queryByText('my words')).toBeNull();
    expect(screen.getByText('2 comments')).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'DELETE')?.path).toBe('/library/comments/c2');
    await act(async () => answer.resolve(ok(comment('c2', { status: 'removed', body: null }))));
    expect(screen.queryByText('my words')).toBeNull();
  });

  it('puts it back where it was, and says so, when the server refuses', async () => {
    open({ 'DELETE /library/comments/c2': fail({ status: 500, kind: 'server' }) }, [comment('c1'), mine, comment('c3')]);
    await screen.findByText('my words');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await act(async () => shownAlert().buttons.find((b) => b.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
    expect(alert.mock.calls[1]?.[0]).toBe('Couldn’t delete the comment');
    const bodies = screen.getAllByText(/^(comment c1|my words|comment c3)$/).map((e) => e.textContent);
    expect(bodies).toEqual(['comment c1', 'my words', 'comment c3']);
    expect(screen.getByText('3 comments')).toBeTruthy();
  });
});

describe('deleting your own post', () => {
  it('is in the post’s menu with Edit, says it can’t be undone, and goes back once it is gone', async () => {
    const heard: DeletedPost[] = [];
    const stop = onPostDeleted((p) => heard.push(p));
    const { client, onExit } = open({ 'DELETE /library/posts/p1': ok({ ...POST, status: 'removed' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Post options' }));
    expect(screen.getByRole('button', { name: 'Edit post' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(screen.getByRole('heading', { name: 'Delete this post?' })).toBeTruthy();
    expect(screen.getByText('This can’t be undone.')).toBeTruthy();
    expect(client.calls.some((c) => c.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    expect(client.calls.find((c) => c.method === 'DELETE')?.path).toBe('/library/posts/p1');
    expect(heard).toEqual([{ targetType: 'library', id: 'p1' }]);
    stop();
  });

  it('goes at once, once confirmed, and says why when the server refused, the lists keeping it', async () => {
    const said = watchNotices();
    const heard: DeletedPost[] = [];
    const stop = onPostDeleted((p) => heard.push(p));
    let answer: (r: unknown) => void = () => undefined;
    const { onExit } = open({ 'DELETE /library/posts/p1': () => new Promise((resolve) => (answer = resolve)) } as never);
    fireEvent.click(await screen.findByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // Gone before the server has answered.
    expect(onExit).toHaveBeenCalledTimes(1);
    await act(async () => answer(fail({ status: 500, kind: 'server', message: 'boom' })));
    expect(said).toHaveBeenCalledWith('Something went wrong on our end. Please try again shortly.');
    // The lists were never told it was gone.
    expect(heard).toEqual([]);
    stop();
  });

  it('offers no menu on somebody else’s post', async () => {
    open({ 'GET /library/posts/p1': ok({ ...POST, authorId: 'u-azad' }) });
    await screen.findByText('Rovî û Gur');
    expect(screen.queryByRole('button', { name: 'Post options' })).toBeNull();
    expect(within(document.body).getByRole('button', { name: 'Report this post' })).toBeTruthy();
  });
});
