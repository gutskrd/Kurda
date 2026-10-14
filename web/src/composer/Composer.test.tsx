import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postDraftStorageKey } from '@kurda/shared';
import { ApiClient } from '../lib/api';
import type { ApiResult } from '../lib/types';
import { PostButton } from '../feed/PostButton';
import { jsonResponse, renderApp } from '../test/utils';
import { Composer } from './Composer';
import type { ComposedPost } from './types';

const ME = { id: 'me-1', username: 'hamude', email: 'h@x.test', displayName: null, emailVerified: true };

interface Call {
  method: string;
  url: string;
  body: unknown;
}

let calls: Call[] = [];
let answers: Record<string, () => Response> = {};
let uploads: string[] = [];
let uploadAnswer: () => ApiResult<unknown> = () => ({
  ok: true,
  data: { imageMediaId: `image-post/${uploads.length}.webp`, url: `https://cdn.test/${uploads.length}.webp`, width: 1280, height: 720 },
});

function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      calls.push({ method, url: path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/me') return jsonResponse(200, { user: ME });
      const key = Object.keys(answers).find((k) => `${method} ${path}`.startsWith(k));
      if (key) return answers[key]!();
      if (path.startsWith('/me/library/drafts')) return jsonResponse(200, { posts: [] });
      return jsonResponse(200, {});
    }),
  );
  vi.spyOn(ApiClient.prototype, 'uploadWithProgress').mockImplementation(async (path: string, _blob: Blob, onProgress) => {
    uploads.push(path);
    onProgress(0.5);
    return uploadAnswer() as ApiResult<never>;
  });
}

const posted = (over: Partial<ComposedPost> = {}): ComposedPost => ({
  id: 'post-1',
  authorId: ME.id,
  type: 'gotin',
  title: null,
  body: 'Silav',
  media: [],
  meme: false,
  sourceCredit: null,
  status: 'published',
  viewCount: 0,
  commentCount: 0,
  createdAt: '2026-10-14T10:00:00Z',
  publishedAt: '2026-10-14T10:00:00Z',
  ...over,
});

const sent = (method: string, prefix: string) => calls.filter((c) => c.method === method && c.url.startsWith(prefix));
const aPicture = (name = 'cira.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

beforeEach(() => {
  calls = [];
  answers = {};
  uploads = [];
  uploadAnswer = () => ({
    ok: true,
    data: { imageMediaId: `image-post/${uploads.length}.webp`, url: `https://cdn.test/${uploads.length}.webp`, width: 1280, height: 720 },
  });
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  stubApi();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Open the composer the way the wall does. */
async function open(onPosted = vi.fn()): Promise<{ onPosted: typeof onPosted }> {
  renderApp(<PostButton onPosted={onPosted} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Post something' }));
  await screen.findByRole('dialog', { name: 'New post' });
  return { onPosted };
}

const box = () => screen.getByRole('textbox', { name: 'What you want to say' });
const postButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Post' });

async function addPictures(...files: File[]): Promise<void> {
  await userEvent.upload(screen.getByLabelText('Picture file'), files);
}

describe('the composer', () => {
  it('asks nothing first: one box, focused, and Post comes on once there are words', async () => {
    answers['POST /library/posts'] = () => jsonResponse(201, posted());
    const { onPosted } = await open();

    expect(box()).toHaveFocus();
    // no "words or a picture?" anywhere
    expect(screen.queryByText(/what are you posting/i)).not.toBeInTheDocument();
    expect(postButton()).toBeDisabled();

    await userEvent.type(box(), '  Silav li we!  ');
    expect(postButton()).toBeEnabled();
    await userEvent.click(postButton());

    await waitFor(() => expect(onPosted).toHaveBeenCalled());
    // a gotin: no title, the text trimmed as the server counts it
    expect(sent('POST', '/library/posts')[0]!.body).toEqual({ type: 'gotin', body: 'Silav li we!' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(postDraftStorageKey(ME.id))).toBeNull();
  });

  it('makes a story of a post with a title, and a poem when you say so', async () => {
    answers['POST /library/posts'] = () => jsonResponse(201, posted({ type: 'poem' }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add a title' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Çiya');
    await userEvent.type(box(), 'Line one\nLine two');
    expect(screen.getByRole('radio', { name: 'Story' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Poem' }));
    await userEvent.click(postButton());
    await waitFor(() => expect(sent('POST', '/library/posts')).toHaveLength(1));
    expect(sent('POST', '/library/posts')[0]!.body).toEqual({ type: 'poem', title: 'Çiya', body: 'Line one\nLine two' });
  });

  it('says a poem needs its title, beside the button it keeps off', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add a title' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Poem' }));
    await userEvent.type(box(), 'Words');
    expect(postButton()).toBeDisabled();
    expect(screen.getByText('A poem needs a title.')).toBeInTheDocument();
  });

  it('uploads a picture as soon as it is added, and posts it with no words and its description', async () => {
    answers['POST /library/posts'] = () => jsonResponse(201, posted({ body: '' }));
    await open();
    await addPictures(aPicture());

    expect(uploads).toEqual(['/images/upload']);
    await userEvent.click(await screen.findByRole('button', { name: 'Describe picture 1' }));
    await userEvent.type(screen.getByLabelText('Describe this picture'), 'Snow on the Zagros');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Mark as a meme' }));

    expect(postButton()).toBeEnabled();
    await userEvent.click(postButton());
    await waitFor(() => expect(sent('POST', '/library/posts')).toHaveLength(1));
    expect(sent('POST', '/library/posts')[0]!.body).toEqual({
      type: 'gotin',
      body: '',
      media: [{ mediaKey: 'image-post/1.webp', altText: 'Snow on the Zagros' }],
      meme: true,
    });
  });

  it('puts a picture up again without the signature when "I made this" is switched off', async () => {
    await open();
    await addPictures(aPicture());
    await userEvent.click(await screen.findByRole('button', { name: 'Describe picture 1' }));
    const own = screen.getByRole('switch', { name: 'I made this' });
    expect(own).toBeChecked();

    await userEvent.click(own);
    expect(uploads).toEqual(['/images/upload', '/images/upload?ownWork=false']);
    expect(screen.getByRole('switch', { name: 'I made this' })).not.toBeChecked();
  });

  it('takes up to four pictures, and says so when more are chosen', async () => {
    await open();
    await addPictures(aPicture('1.png'), aPicture('2.png'), aPicture('3.png'), aPicture('4.png'), aPicture('5.png'));
    expect(uploads).toHaveLength(4);
    expect(screen.getByText('A post can have up to 4 pictures.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a picture (4 of 4)' })).toBeDisabled();

    // and any can be taken off at any time
    await userEvent.click(screen.getByRole('button', { name: 'Remove picture 2' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Add a picture (3 of 4)' })).toBeEnabled();
  });

  it('says why an upload failed, keeps Post off, and tries again on request', async () => {
    uploadAnswer = () => ({ ok: false, error: { kind: 'client', code: 'UPLOAD_TOO_LARGE', message: 'too big', status: 413 } });
    await open();
    await userEvent.type(box(), 'With a picture');
    await addPictures(aPicture());

    expect(await screen.findByText('This picture is too big. Try a smaller one.')).toBeInTheDocument();
    expect(postButton()).toBeDisabled();
    expect(screen.getByText('A picture didn’t upload. Try it again, or remove it.')).toBeInTheDocument();

    uploadAnswer = () => ({ ok: true, data: { imageMediaId: 'image-post/ok.webp', url: 'https://cdn.test/ok.webp', width: 1, height: 1 } });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(postButton()).toBeEnabled());
  });

  it('counts the way the server does, only near the end, and stops at the limit', async () => {
    await open();
    // 45,000 is not near the 50,000 limit; 49,990 is
    const long = 'a'.repeat(49_990);
    await act(async () => {
      await userEvent.click(box());
      await userEvent.paste(long);
    });
    expect(screen.getByLabelText('10 characters left')).toBeInTheDocument();
    expect(postButton()).toBeEnabled();

    await userEvent.paste('b'.repeat(20));
    expect(screen.getByLabelText('-10 characters left')).toBeInTheDocument();
    expect(postButton()).toBeDisabled();
    expect(screen.getByText('The text is over 50,000 characters.')).toBeInTheDocument();
  });

  it('adds a source under the post, and always shows the hint about it', async () => {
    answers['POST /library/posts'] = () => jsonResponse(201, posted());
    await open();
    expect(screen.getByText('Post what you made. Quoting someone? Add the source.')).toBeInTheDocument();
    await userEvent.type(box(), '“Ez im, ez im, ez im Kurd.”');
    await userEvent.click(screen.getByRole('button', { name: 'Add a source or credit' }));
    await userEvent.type(screen.getByLabelText('Source / credit'), 'Cegerxwîn');
    await userEvent.click(postButton());
    await waitFor(() => expect(sent('POST', '/library/posts')).toHaveLength(1));
    expect(sent('POST', '/library/posts')[0]!.body).toMatchObject({ sourceCredit: 'Cegerxwîn' });
  });

  it('posts with Ctrl+Enter, and shows the server’s refusal in words', async () => {
    answers['POST /library/posts'] = () => jsonResponse(429, { code: 'TRUST_VELOCITY', message: 'slow down' });
    await open();
    await userEvent.type(box(), 'Quickly');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('You’re posting quickly for a new account.');
    // said once: the polite status line does not repeat it
    expect(screen.getAllByText(/You’re posting quickly for a new account\./)).toHaveLength(1);
    // still open, with the words still there
    expect(box()).toHaveValue('Quickly');
  });

  it('says a limit on posting as a limit, with the way to Account standing', async () => {
    answers['POST /library/posts'] = () => jsonResponse(403, { code: 'MUTED', message: 'muted', details: { scope: 'post', until: null } });
    await open();
    await userEvent.type(box(), 'Silav');
    await userEvent.click(postButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('You can’t post or comment right now.');
    expect(screen.getByRole('link', { name: 'See your account standing' })).toHaveAttribute('href', '/app/settings/standing');
    expect(box()).toHaveValue('Silav');
  });

  it('keeps what you wrote on this device, brings it back, and asks before closing', async () => {
    await open();
    await userEvent.type(box(), 'Half a thought');
    await waitFor(() => expect(localStorage.getItem(postDraftStorageKey(ME.id))).toContain('Half a thought'));

    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Keep this post for later?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep draft' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Post something' }));
    expect(await screen.findByRole('textbox', { name: 'What you want to say' })).toHaveValue('Half a thought');
    expect(screen.getByText('Your draft is back.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    expect(localStorage.getItem(postDraftStorageKey(ME.id))).toBeNull();
  });

  it('keeps the last words typed when Keep draft is pressed before the save timer runs', async () => {
    await open();
    await userEvent.type(box(), 'Hevalo');
    await waitFor(() => expect(localStorage.getItem(postDraftStorageKey(ME.id))).toContain('Hevalo'));
    // typed and closed straight away: the timer has not written this yet
    await userEvent.type(box(), ' bijî');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Keep draft' }));
    expect(localStorage.getItem(postDraftStorageKey(ME.id))).toContain('Hevalo bijî');
  });

  it('writes in the words’ own direction, and in the interface’s while the box is empty', async () => {
    await open();
    // empty: no dir of its own, so the placeholder follows the page (right to left in Soranî)
    expect(box()).not.toHaveAttribute('dir');
    await userEvent.type(box(), 'Silav');
    expect(box()).toHaveAttribute('dir', 'auto');
  });

  it('closes at once when there is nothing to lose', async () => {
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers to finish a draft the old app saved, and publishes it when done', async () => {
    const old = posted({ id: 'draft-9', type: 'story', title: 'Rojek', body: 'Unfinished', status: 'draft', updatedAt: '2026-09-01T10:00:00Z' });
    answers['GET /me/library/drafts'] = () => jsonResponse(200, { posts: [old] });
    answers['PATCH /library/posts/draft-9'] = () => jsonResponse(200, { ...old, body: 'Finished now' });
    answers['POST /library/posts/draft-9/publish'] = () => jsonResponse(200, { ...old, status: 'published' });
    const { onPosted } = await open();

    await userEvent.click(await screen.findByRole('button', { name: 'Finish one' }));
    await userEvent.click(screen.getByRole('button', { name: /Rojek/ }));
    expect(screen.getByRole('heading', { name: 'Finish your draft' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Rojek');

    await userEvent.clear(box());
    await userEvent.type(box(), 'Finished now');
    await userEvent.click(postButton());
    await waitFor(() => expect(onPosted).toHaveBeenCalled());
    expect(sent('PATCH', '/library/posts/draft-9')[0]!.body).toMatchObject({ type: 'story', title: 'Rojek', body: 'Finished now', media: [] });
    expect(sent('POST', '/library/posts/draft-9/publish')).toHaveLength(1);
  });
});

describe('editing a post', () => {
  it('changes the words and a picture’s description, and takes a picture off', async () => {
    const post = posted({
      id: 'p-7',
      body: 'Before',
      media: [
        { mediaKey: 'image-post/a.webp', url: 'https://cdn.test/a.webp', altText: null, width: 1, height: 1 },
        { mediaKey: 'image-post/b.webp', url: 'https://cdn.test/b.webp', altText: 'Old words', width: 1, height: 1 },
      ],
    });
    answers['PATCH /library/posts/p-7'] = () => jsonResponse(200, post);
    const onPosted = vi.fn();
    renderApp(<Composer editing={post} onClose={() => undefined} onPosted={onPosted} />);

    expect(await screen.findByRole('heading', { name: 'Edit post' })).toBeInTheDocument();
    await userEvent.clear(box());
    await userEvent.type(box(), 'After');
    await userEvent.click(screen.getByRole('button', { name: 'Remove picture 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the description of picture 1' }));
    // a picture already on the post keeps its signature as it was; the page does not
    // know which way that went, so no switch claims either, only how to change it
    expect(screen.queryByRole('switch', { name: 'I made this' })).toBeNull();
    expect(screen.getByText(/Whether this picture has your Hevalo mark was decided when it was posted/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Describe this picture'));
    await userEvent.type(screen.getByLabelText('Describe this picture'), 'New words');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onPosted).toHaveBeenCalled());
    expect(sent('PATCH', '/library/posts/p-7')[0]!.body).toEqual({
      type: 'gotin',
      title: null,
      body: 'After',
      media: [{ mediaKey: 'image-post/b.webp', altText: 'New words' }],
      meme: false,
      sourceCredit: null,
    });
    // no picture was uploaded for an edit that only took one off
    expect(uploads).toHaveLength(0);
  });

  it('asks before throwing changes away', async () => {
    const onClose = vi.fn();
    renderApp(<Composer editing={posted({ body: 'Same' })} onClose={onClose} onPosted={() => undefined} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'What you want to say' }), ' and more');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Throw away your changes?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep writing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(box()).toHaveValue('Same and more');
  });
});
