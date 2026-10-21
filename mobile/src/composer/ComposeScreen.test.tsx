// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: null }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { postDraftStorageKey } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { memoryStore } from '../keyboard/deviceStore';
import type { ComposerPost } from './api';
import type { ApiResult } from '../api/types';
import { ComposeScreen, type PickedPicture } from './ComposeScreen';
import type { PictureUpload } from './upload';
import { onPostSaved } from './postSaved';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';

patchReactNativeWeb({ reduceMotion: true });

const DRAFTS = 'GET /me/library/drafts?limit=20';
const KEY = postDraftStorageKey('me');

function created(over: Partial<ComposerPost> = {}): ComposerPost {
  return {
    id: 'post-1',
    authorId: 'me',
    type: 'gotin',
    title: null,
    body: '',
    status: 'published',
    media: [],
    meme: false,
    sourceCredit: null,
    updatedAt: '2026-10-14T10:00:00.000Z',
    ...over,
  };
}

/** Pictures picked one after another, and uploads that finish when the test says. */
function pictures(...uris: string[]) {
  const pick = vi.fn(async (): Promise<PickedPicture[]> => uris.map((uri) => ({ uri, contentType: 'image/jpeg' })));
  const pending: Array<{ uri: string; ownWork: boolean; finish: (r: PictureUpload) => void; progress: (f: number) => void }> = [];
  const upload = vi.fn(
    (_client: unknown, p: { uri: string; ownWork: boolean }, _t: unknown, onProgress: (f: number) => void) =>
      new Promise<PictureUpload>((resolve) => pending.push({ uri: p.uri, ownWork: p.ownWork, finish: resolve, progress: onProgress })),
  );
  const done = (i: number, key = `images/${i}.webp`) =>
    pending[i]!.finish({ ok: true, mediaKey: key, url: null, width: 800, height: 600 });
  return { pick, upload, pending, done };
}

/** Longer than the draft's save delay, so a save still waiting would have happened. */
const pastSaveDelay = () => new Promise((resolve) => setTimeout(resolve, 600));

const postButton = () => screen.getByRole('button', { name: 'Post' });
const disabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

beforeEach(() => {
  testAuth.user = { ...testAuth.user, id: 'me' };
});
afterEach(cleanup);

describe('writing a post', () => {
  it('posts words as a saying, and forgets the draft once it is up', async () => {
    const client = fakeClient({ [DRAFTS]: ok({ posts: [] }), 'POST /library/posts': ok(created({ body: 'Silav' })) });
    testAuth.client = client;
    const store = memoryStore();
    const onExit = vi.fn();
    renderWithProviders(<ComposeScreen onExit={onExit} store={store} />);

    const box = await screen.findByLabelText('Your post');
    expect(disabled(postButton())).toBe(true);
    fireEvent.change(box, { target: { value: '  Silav li we!  ' } });
    expect(disabled(postButton())).toBe(false);
    // kept on the phone as it is written
    await waitFor(() => expect(store.data.get(KEY)).toContain('Silav li we!'));

    fireEvent.click(postButton());
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    expect(client.calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/library/posts',
      body: { type: 'gotin', body: 'Silav li we!' },
    });
    expect(store.data.has(KEY)).toBe(false);
  });

  it('does not save a post that went up straight after the last letter back as a draft', async () => {
    const client = fakeClient({ [DRAFTS]: ok({ posts: [] }), 'POST /library/posts': ok(created({ body: 'Zû' })) });
    testAuth.client = client;
    const store = memoryStore();
    const onExit = vi.fn();
    renderWithProviders(<ComposeScreen onExit={onExit} store={store} />);
    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Zû' } });
    // Post at once, while the save for that last letter is still waiting
    fireEvent.click(postButton());
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    await pastSaveDelay();
    expect(store.data.has(KEY)).toBe(false);
  });

  it('asks a story for a title before it can go up', async () => {
    const client = fakeClient({ [DRAFTS]: ok({ posts: [] }), 'POST /library/posts': ok(created({ type: 'story' })) });
    testAuth.client = client;
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);

    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Carekê hebû…' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Story' }));
    expect(screen.getByRole('radio', { name: 'Story' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('A story or a poem needs a title.')).toBeTruthy();
    expect(disabled(postButton())).toBe(true);

    fireEvent.change(screen.getByLabelText('Title (a story or a poem has one)'), { target: { value: 'Rovî û Gur' } });
    expect(disabled(postButton())).toBe(false);
    fireEvent.click(postButton());
    await waitFor(() =>
      expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ type: 'story', title: 'Rovî û Gur', body: 'Carekê hebû…' }),
    );
  });

  it('counts as the server counts, and stops at the limit', async () => {
    testAuth.client = fakeClient({ [DRAFTS]: ok({ posts: [] }) });
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);
    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'a'.repeat(45_100) } });
    expect(screen.getByText('4900 left')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your post'), { target: { value: `${'a'.repeat(50_002)}\n\n` } });
    expect(screen.getByText('2 too many')).toBeTruthy();
    expect(disabled(postButton())).toBe(true);
  });

  it('says why a post was refused', async () => {
    testAuth.client = fakeClient({
      [DRAFTS]: ok({ posts: [] }),
      'POST /library/posts': fail({ code: 'TRUST_VELOCITY', kind: 'rate_limited', status: 429 }),
    });
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);
    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Dîsa' } });
    fireEvent.click(postButton());
    expect(await screen.findByText('You’re posting quickly. Wait a little and try again.')).toBeTruthy();
  });
});

describe('a limit on posting', () => {
  it('is said as a limit, with the way to Account standing, and keeps what was written', async () => {
    testAuth.client = fakeClient({
      [DRAFTS]: ok({ posts: [] }),
      'POST /library/posts': fail({ code: 'MUTED', status: 403, details: { scope: 'post', until: null } }),
    });
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);
    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Dîsa' } });
    fireEvent.click(postButton());
    expect(await screen.findByText('You can’t post or comment right now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeTruthy();
    expect((screen.getByLabelText('Your post') as HTMLTextAreaElement).value).toBe('Dîsa');
  });
});

describe('pictures', () => {
  it('uploads pictures as they are added, and posts them with their descriptions as a meme', async () => {
    const client = fakeClient({ [DRAFTS]: ok({ posts: [] }), 'POST /library/posts': ok(created()) });
    testAuth.client = client;
    const p = pictures('file:///one.jpg', 'file:///two.jpg');
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} pick={p.pick} upload={p.upload} />);

    await screen.findByLabelText('Your post');
    fireEvent.click(screen.getByRole('button', { name: 'Add pictures' }));
    await waitFor(() => expect(p.upload).toHaveBeenCalledTimes(2));
    expect(p.pick).toHaveBeenCalledWith(4);
    // the signature goes on unless "I made this" is switched off
    expect(p.pending.map((x) => x.ownWork)).toEqual([true, true]);

    // nothing goes up while a picture is on its way
    p.pending[0]!.progress(0.5);
    expect(await screen.findByLabelText('Picture 1 of 2 — uploading, 50%')).toBeTruthy();
    expect(disabled(postButton())).toBe(true);
    p.done(0);
    p.done(1);
    await waitFor(() => expect(disabled(postButton())).toBe(false));
    expect(screen.getByText('2/4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Describe picture 2 of 2' }));
    fireEvent.change(screen.getByLabelText('Description (alt text)'), { target: { value: 'Pisîk li ser textê' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Meme' }));

    // a post may be only its pictures
    fireEvent.click(postButton());
    await waitFor(() =>
      expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({
        type: 'gotin',
        body: '',
        media: [{ mediaKey: 'images/0.webp' }, { mediaKey: 'images/1.webp', altText: 'Pisîk li ser textê' }],
        meme: true,
      }),
    );
  });

  it('shows a failed upload with a way to try again, and removes a picture', async () => {
    testAuth.client = fakeClient({ [DRAFTS]: ok({ posts: [] }) });
    const p = pictures('file:///one.jpg');
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} pick={p.pick} upload={p.upload} />);
    await screen.findByLabelText('Your post');
    fireEvent.click(screen.getByRole('button', { name: 'Add pictures' }));
    await waitFor(() => expect(p.upload).toHaveBeenCalledTimes(1));
    p.pending[0]!.finish({ ok: false, error: 'That picture is too large. Try a smaller one.' });
    expect(await screen.findByText('That picture is too large. Try a smaller one.')).toBeTruthy();
    expect(disabled(postButton())).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(p.upload).toHaveBeenCalledTimes(2));
    p.done(1);
    await waitFor(() => expect(disabled(postButton())).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Remove picture 1 of 1' }));
    expect(screen.queryByRole('button', { name: 'Remove picture 1 of 1' })).toBeNull();
    expect(disabled(postButton())).toBe(true);
  });

  it('uploads a picture again, unsigned, when "I made this" is switched off', async () => {
    testAuth.client = fakeClient({ [DRAFTS]: ok({ posts: [] }) });
    const p = pictures('file:///one.jpg');
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} pick={p.pick} upload={p.upload} />);
    await screen.findByLabelText('Your post');
    fireEvent.click(screen.getByRole('button', { name: 'Add pictures' }));
    await waitFor(() => expect(p.upload).toHaveBeenCalledTimes(1));
    p.done(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Describe picture 1 of 1' }));
    expect(screen.getByText('Hevalo puts a small signature with your name on it.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'I made this' }));
    await waitFor(() => expect(p.upload).toHaveBeenCalledTimes(2));
    expect(p.pending[1]!.ownWork).toBe(false);
    expect(screen.getByText('No signature. Add the source so people know whose it is.')).toBeTruthy();
  });

  it('opens the photos at once from "Choose a picture" on Memes, and makes what is picked a meme', async () => {
    const client = fakeClient({ [DRAFTS]: ok({ posts: [] }), 'POST /library/posts': ok(created()) });
    testAuth.client = client;
    const p = pictures('file:///meme.jpg');
    renderWithProviders(
      <ComposeScreen onExit={() => undefined} store={memoryStore()} pick={p.pick} upload={p.upload} startWithPictures asMeme />,
    );
    await waitFor(() => expect(p.pick).toHaveBeenCalledOnce());
    await waitFor(() => expect(p.upload).toHaveBeenCalledOnce());
    // finished inside act(), so Post is enabled — and told so — before it is pressed (see "a post going up")
    await act(async () => p.done(0));
    expect((screen.getByRole('switch', { name: 'Meme' }) as HTMLInputElement).checked).toBe(true);
    expect(disabled(postButton())).toBe(false);
    fireEvent.click(postButton());
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST')?.body).toMatchObject({ meme: true }));
    expect(p.pick).toHaveBeenCalledOnce();
  });

  it('says what to do when the photos may not be opened', async () => {
    testAuth.client = fakeClient({ [DRAFTS]: ok({ posts: [] }) });
    renderWithProviders(
      <ComposeScreen onExit={() => undefined} store={memoryStore()} pick={async () => 'denied'} upload={vi.fn()} />,
    );
    await screen.findByLabelText('Your post');
    fireEvent.click(screen.getByRole('button', { name: 'Add pictures' }));
    expect(await screen.findByText('Hevalo needs access to your photos so you can choose one to post.')).toBeTruthy();
  });
});

describe('source and credit', () => {
  it('asks for the source of what someone did not make, and sends it', async () => {
    const client = fakeClient({ [DRAFTS]: ok({ posts: [] }), 'POST /library/posts': ok(created()) });
    testAuth.client = client;
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);
    expect(await screen.findByText('Post what you made. Quoting someone? Add the source.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your post'), { target: { value: 'Dar bi rehan e.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a source' }));
    fireEvent.change(screen.getByLabelText('Source / credit'), { target: { value: 'Gotina pêşiyan' } });
    fireEvent.click(postButton());
    await waitFor(() =>
      expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ type: 'gotin', body: 'Dar bi rehan e.', sourceCredit: 'Gotina pêşiyan' }),
    );
  });
});

describe('drafts', () => {
  it('brings back what was being written, and asks before leaving with it', async () => {
    testAuth.client = fakeClient({ [DRAFTS]: ok({ posts: [] }) });
    const store = memoryStore({
      [KEY]: JSON.stringify({ version: 1, type: 'poem', title: 'Şev', body: 'Stêrk', pictures: [], meme: false, sourceCredit: '', savedAt: Date.now() }),
    });
    const onExit = vi.fn();
    // opened inside act(), so the draft has been read back and Cancel knows there is one before it is pressed
    await act(async () => {
      renderWithProviders(<ComposeScreen onExit={onExit} store={store} />);
    });
    expect((screen.getByLabelText('Your post') as HTMLTextAreaElement).value).toBe('Stêrk');
    expect((screen.getByLabelText('Title (a story or a poem has one)') as HTMLInputElement).value).toBe('Şev');
    expect(screen.getByRole('radio', { name: 'Poem' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Keep this draft?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    // the save that was waiting when Delete was tapped does not bring it back
    await pastSaveDelay();
    expect(store.data.has(KEY)).toBe(false);
  });

  it('closes at once when nothing was written', async () => {
    testAuth.client = fakeClient({ [DRAFTS]: ok({ posts: [] }) });
    const onExit = vi.fn();
    renderWithProviders(<ComposeScreen onExit={onExit} store={memoryStore()} />);
    await screen.findByLabelText('Your post');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('finds a draft an older app saved on the server, and publishes it', async () => {
    const old = created({ id: 'd1', type: 'story', title: 'Bajarê kevn', body: 'Rojek ji rojan', status: 'draft' });
    const client = fakeClient({
      [DRAFTS]: ok({ posts: [old] }),
      'POST /library/posts/d1/publish': ok({ ...old, status: 'published' }),
    });
    testAuth.client = client;
    const onExit = vi.fn();
    renderWithProviders(<ComposeScreen onExit={onExit} store={memoryStore()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Saved drafts to finish: 1' }));
    fireEvent.click(screen.getByRole('button', { name: /Bajarê kevn/ }));
    expect(screen.getByText('Finish your draft')).toBeTruthy();
    expect((screen.getByLabelText('Your post') as HTMLTextAreaElement).value).toBe('Rojek ji rojan');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    // nothing was changed, so nothing is patched: it only goes up
    expect(client.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual(['POST /library/posts/d1/publish']);
  });
});

describe('editing', () => {
  it('opens your post and saves only what changed', async () => {
    const before = created({
      body: 'Berê',
      media: [{ mediaKey: 'images/a.webp', url: 'https://cdn.test/a.webp', altText: null, width: 10, height: 10 }],
    });
    const client = fakeClient({ 'GET /library/posts/post-1': ok(before), 'PATCH /library/posts/post-1': ok(before) });
    testAuth.client = client;
    const onExit = vi.fn();
    renderWithProviders(<ComposeScreen postId="post-1" onExit={onExit} />);
    expect(await screen.findByText('Edit post')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(disabled(save)).toBe(true);
    // a picture already on the post keeps its signature as it went up
    fireEvent.click(screen.getByRole('button', { name: 'Describe picture 1 of 1' }));
    expect(screen.queryByRole('switch', { name: 'I made this' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    const saved = vi.fn();
    const stop = onPostSaved(saved);
    fireEvent.change(screen.getByLabelText('Your post'), { target: { value: 'Niha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    stop();
    expect(client.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ body: 'Niha' });
    // the post's own page hears of it, and reloads then rather than on every return
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'post-1' }));
  });

  it('asks before throwing an edit away', async () => {
    testAuth.client = fakeClient({ 'GET /library/posts/post-1': ok(created({ body: 'Berê' })) });
    const onExit = vi.fn();
    renderWithProviders(<ComposeScreen postId="post-1" onExit={onExit} />);
    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Niha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onExit).toHaveBeenCalled();
  });
});

describe('a post going up', () => {
  it('is felt as a light tap, and one that is refused as an error', async () => {
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    try {
      /*
       * The refusal is answered inside act(), so the screen has finished with
       * it — drawn, and Post enabled again — before it is pressed a second
       * time. Waiting only for the words to appear was not enough: Post is
       * told it is pressable again in an effect after that draw, and a press
       * that landed in between, on a busy machine, was dropped.
       */
      let answer: (result: ApiResult<ComposerPost>) => void = () => undefined;
      let refused = false;
      testAuth.client = fakeClient({
        [DRAFTS]: ok({ posts: [] }),
        'POST /library/posts': () => (refused ? ok(created({ body: 'Dîsa' })) : new Promise<ApiResult<ComposerPost>>((resolve) => (answer = resolve))),
      });
      const onExit = vi.fn();
      renderWithProviders(<ComposeScreen onExit={onExit} store={memoryStore()} />);
      fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Dîsa' } });
      fireEvent.click(postButton());
      await act(async () => {
        refused = true;
        answer(fail({ code: 'TRUST_VELOCITY', kind: 'rate_limited', status: 429 }));
      });
      expect(screen.getByText('You’re posting quickly. Wait a little and try again.')).toBeTruthy();
      expect(disabled(postButton())).toBe(false);
      expect(felt).toEqual(['error']);

      resetHaptics();
      fireEvent.click(postButton());
      await waitFor(() => expect(onExit).toHaveBeenCalled());
      expect(felt).toEqual(['error', 'tap']);
    } finally {
      stop();
    }
  });
});
