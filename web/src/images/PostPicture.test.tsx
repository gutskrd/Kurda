import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostPicture } from './PostPicture';
import { renderApp, jsonResponse } from '../test/utils';
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

async function openComposer(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Post a picture' }));
}

describe('PostPicture', () => {
  it('offers nothing to a guest — there is nowhere to post from', () => {
    uploadFetch();
    renderApp(<PostPicture onPosted={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Post a picture' })).not.toBeInTheDocument();
  });

  it('uploads the bytes first, then creates the post that references them', async () => {
    signIn();
    const { steps } = uploadFetch();
    const onPosted = vi.fn();
    renderApp(<PostPicture onPosted={onPosted} />);
    await openComposer();

    await userEvent.upload(screen.getByLabelText('Picture file'), aPicture());
    await screen.findByLabelText('Choose a different picture');
    await userEvent.type(screen.getByLabelText('Caption'), 'Çiya');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(onPosted).toHaveBeenCalled());
    // order matters: the server only accepts a media id that already cleared
    // the upload pipeline, so these cannot be collapsed or swapped
    expect(steps[0]).toBe('upload image/png');
    expect(steps).toHaveLength(2);
    const body = JSON.parse(steps[1]!.replace('create ', ''));
    expect(body).toMatchObject({ imageMediaId: 'image-post/abc.webp', caption: 'Çiya', category: 'image' });
  });

  it('sends the kind you picked', async () => {
    signIn();
    const { steps } = uploadFetch();
    renderApp(<PostPicture onPosted={() => undefined} />);
    await openComposer();

    await userEvent.upload(screen.getByLabelText('Picture file'), aPicture());
    await screen.findByLabelText('Choose a different picture');
    await userEvent.click(screen.getByRole('button', { name: 'Meme' }));
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(steps).toHaveLength(2));
    expect(JSON.parse(steps[1]!.replace('create ', '')).category).toBe('meme');
  });

  it('will not post without a picture', async () => {
    signIn();
    const { steps } = uploadFetch();
    renderApp(<PostPicture onPosted={() => undefined} />);
    await openComposer();

    // a caption alone is not a post — the image is the point
    await userEvent.type(screen.getByLabelText('Caption'), 'just words');
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
    expect(steps).toHaveLength(0);
  });

  it('says why an upload was refused, and does not pretend it posted', async () => {
    signIn();
    const { steps } = uploadFetch({ uploadStatus: 503 });
    const onPosted = vi.fn();
    renderApp(<PostPicture onPosted={onPosted} />);
    await openComposer();

    await userEvent.upload(screen.getByLabelText('Picture file'), aPicture());
    await screen.findByLabelText('Choose a different picture');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/storage isn’t switched on/i);
    expect(onPosted).not.toHaveBeenCalled();
    // it never got as far as creating the post
    expect(steps.filter((s) => s.startsWith('create'))).toHaveLength(0);
  });
});
