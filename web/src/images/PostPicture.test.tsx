import { StrictMode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PictureComposer } from './PostPicture';
import { renderApp, jsonResponse } from '../test/utils';
import type { ImagePost } from '../lib/types';
import { stubCanvas, stubImage } from './canvasStubs';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const aPicture = () => new File([new Uint8Array([1, 2, 3])], 'welat.png', { type: 'image/png' });

/**
 * Answer the two upload steps and record them in order.
 *
 * jsdom has neither a canvas nor an Image that loads, and the composer draws
 * the picture before it can upload it — hence the stubs.
 */
function uploadFetch(opts: { uploadStatus?: number; createStatus?: number } = {}) {
  const steps: string[] = [];
  stubImage();
  stubCanvas();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/me') && !url.includes('images')) {
      return jsonResponse(200, { user: { id: 'me', username: 'me' } });
    }
    if (url.includes('/images/upload')) {
      steps.push(`upload ${String((init?.headers as Record<string, string>)?.['content-type'])}`);
      return opts.uploadStatus && opts.uploadStatus >= 400
        ? jsonResponse(opts.uploadStatus, { code: 'MEDIA_UNAVAILABLE', message: 'off' })
        : jsonResponse(201, { imageMediaId: 'image-post/abc.webp', url: 'https://cdn.test/abc.webp' });
    }
    if (url.endsWith('/images')) {
      steps.push(`create ${String(init?.body)}`);
      return opts.createStatus && opts.createStatus >= 400
        ? jsonResponse(opts.createStatus, { code: 'INVALID_POST', message: 'no' })
        : jsonResponse(201, { id: 'new', caption: 'Çiya', imageUrl: 'https://cdn.test/abc.webp' });
    }
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetch);
  return { steps };
}

const show = (onDone: (post: ImagePost) => void = () => undefined) =>
  renderApp(<PictureComposer handle="hamude" onDone={onDone} />);

/** Choose a picture and wait for the editor to appear. */
async function pick(file = aPicture(), applyAccept = true): Promise<void> {
  await userEvent.upload(screen.getByLabelText('Picture file'), file, { applyAccept });
  await screen.findByLabelText('Choose a different picture');
}

describe('PictureComposer', () => {
  it('uploads the bytes first, then creates the post that references them', async () => {
    signIn();
    const { steps } = uploadFetch();
    show();

    await pick();
    await userEvent.type(screen.getByLabelText('Caption'), 'Çiya');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(steps).toHaveLength(2));
    // order matters: the server only accepts a media id that already cleared
    // the upload pipeline, so these cannot be collapsed or swapped
    expect(steps[0]).toContain('upload');
    const body = JSON.parse(steps[1]!.replace('create ', ''));
    expect(body).toMatchObject({ imageMediaId: 'image-post/abc.webp', caption: 'Çiya', category: 'image' });
  });

  it('sends the kind you picked', async () => {
    signIn();
    const { steps } = uploadFetch();
    show();

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Mîm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(steps).toHaveLength(2));
    expect(JSON.parse(steps[1]!.replace('create ', '')).category).toBe('meme');
  });

  it('takes a photo the operating system did not label', async () => {
    signIn();
    const { steps } = uploadFetch();
    show();

    // plenty of real photos arrive with an empty `type`; judging by that string
    // turned them away before anything had tried to read them
    await pick(new File([new Uint8Array([1, 2, 3])], 'IMG_4021.JPG', { type: '' }), false);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(steps.some((x) => x.startsWith('upload'))).toBe(true));
  });

  it('still posts a picture this browser cannot draw', async () => {
    signIn();
    const { steps } = uploadFetch();
    stubImage({ fail: true });
    show();

    // a phone photo: the browser has no HEIC decoder, but the server does
    const heic = new File([new Uint8Array([1, 2, 3])], 'IMG_4021.HEIC', { type: 'image/heic' });
    await userEvent.upload(screen.getByLabelText('Picture file'), heic, { applyAccept: false });

    // no editor — there is nothing on screen to put a sticker on — but it says
    // so plainly and still offers to post
    expect(await screen.findByText(/can’t show this kind of picture/i)).toBeInTheDocument();
    expect(screen.getByText('IMG_4021.HEIC')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(steps).toHaveLength(2));
    // the original bytes, not a canvas export of a picture that never rendered
    expect(steps[0]).toBe('upload image/heic');
  });

  it('survives the double render the app actually runs under', async () => {
    signIn();
    uploadFetch();
    renderApp(
      <StrictMode>
        <PictureComposer handle="hamude" onDone={() => undefined} />
      </StrictMode>,
    );

    /*
     * The app is wrapped in StrictMode, so in development every effect here runs
     * mount → cleanup → mount, and the cleanup revokes the first run's object URL
     * while its image is still reading from it. A picture must not be judged
     * unreadable on the strength of that.
     */
    await userEvent.upload(screen.getByLabelText('Picture file'), aPicture());

    expect(await screen.findByLabelText('Choose a different picture')).toBeInTheDocument();
    expect(screen.queryByText(/can’t show this kind of picture/i)).not.toBeInTheDocument();
  });

  it('offers nothing to post until there is a picture', async () => {
    signIn();
    uploadFetch();
    show();
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
  });

  it('says why an upload was refused, and does not pretend it posted', async () => {
    signIn();
    const { steps } = uploadFetch({ uploadStatus: 503 });
    const onDone = vi.fn();
    show(onDone);

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/storage isn’t switched on/i);
    expect(onDone).not.toHaveBeenCalled();
    // it never got as far as creating the post
    expect(steps.filter((s) => s.startsWith('create'))).toHaveLength(0);
  });
});
