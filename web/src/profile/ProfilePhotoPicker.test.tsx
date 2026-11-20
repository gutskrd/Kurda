import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePhotoPicker } from './ProfilePhotoPicker';
import { renderApp, jsonResponse } from '../test/utils';
import { stubCanvas, stubImage } from '../images/canvasStubs';
import type { MeProfile } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const aPicture = () => new File([new Uint8Array([1, 2, 3])], 'me.png', { type: 'image/png' });

const me = (over: Partial<MeProfile> = {}): MeProfile =>
  ({ id: 'me', username: 'rojhat', profilePhotoUrl: null, avatarUrl: null, ...over }) as MeProfile;

/** Answer the upload and record what was sent; `answer` says what the upload gets back instead. */
function photoFetch(opts: { status?: number; answer?: () => Response } = {}) {
  const calls: string[] = [];
  stubImage();
  stubCanvas();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/profile-picture')) {
        calls.push(`${init?.method ?? 'POST'} profile-picture`);
        if (opts.answer) return opts.answer();
        return opts.status && opts.status >= 400
          ? jsonResponse(opts.status, { code: 'MEDIA_UNAVAILABLE', message: 'off' })
          : jsonResponse(200, { profilePhotoUrl: 'https://cdn.test/me.webp' });
      }
      return jsonResponse(200, {});
    }),
  );
  return { calls };
}

/** Choose a picture and wait for the framing step. */
async function pick(): Promise<void> {
  await userEvent.upload(screen.getByLabelText('Upload profile photo'), aPicture());
  await screen.findByLabelText('Zoom');
}

describe('ProfilePhotoPicker', () => {
  /* Pictures always show in a circle, so the reader chooses the framing. */
  it('lets you frame the picture before it becomes your face', async () => {
    signIn();
    photoFetch();
    renderApp(<ProfilePhotoPicker me={me()} onChanged={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Upload your own' }));
    await pick();

    expect(screen.getByRole('application')).toHaveClass('framer-stage', 'is-round');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this picture' })).toBeInTheDocument();
  });

  it('uploads nothing until the framing is accepted', async () => {
    signIn();
    const { calls } = photoFetch();
    renderApp(<ProfilePhotoPicker me={me()} onChanged={() => undefined} />);

    await pick();
    expect(calls).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));
    expect(calls).toEqual(['POST profile-picture']);
  });

  it('backs out without uploading, and comes back to the buttons', async () => {
    signIn();
    const { calls } = photoFetch();
    renderApp(<ProfilePhotoPicker me={me()} onChanged={() => undefined} />);

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(calls).toEqual([]);
    expect(await screen.findByRole('button', { name: 'Upload your own' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Zoom')).not.toBeInTheDocument();
  });

  it('says why an upload was refused rather than pretending it worked', async () => {
    signIn();
    photoFetch({ status: 503 });
    const onChanged = vi.fn();
    renderApp(<ProfilePhotoPicker me={me()} onChanged={onChanged} />);

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/can’t be uploaded right now/i);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('offers Remove only when there is an uploaded photo to remove', () => {
    signIn();
    photoFetch();
    const { unmount } = renderApp(<ProfilePhotoPicker me={me()} onChanged={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    unmount();

    renderApp(<ProfilePhotoPicker me={me({ profilePhotoUrl: 'https://cdn.test/old.webp' })} onChanged={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('shows a new photo held for a person small, saying others still see the old one', async () => {
    signIn();
    photoFetch({
      answer: () =>
        jsonResponse(200, { profilePhotoUrl: 'https://cdn.test/old.webp', review: 'held', profilePhotoPending: { url: 'https://private.test/new.webp?sig=1' } }),
    });
    const onChanged = vi.fn();
    renderApp(<ProfilePhotoPicker me={me({ profilePhotoUrl: 'https://cdn.test/old.webp' })} onChanged={onChanged} />);

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));

    expect(await screen.findByText('Your new photo is being checked. Others see your old one until then.')).toBeInTheDocument();
    expect(document.querySelector('.pcheck-pending img')).toHaveAttribute('src', 'https://private.test/new.webp?sig=1');
    expect(onChanged).toHaveBeenCalled();
  });

  it('keeps showing a photo still waiting when the page is opened again', () => {
    signIn();
    photoFetch();
    renderApp(<ProfilePhotoPicker me={me({ profilePhotoUrl: 'https://cdn.test/old.webp', profilePhotoPending: { url: 'https://private.test/new.webp' } })} onChanged={() => undefined} />);
    expect(screen.getByText('Your new photo is being checked. Others see your old one until then.')).toBeInTheDocument();
  });

  it('says why a photo was refused in the reader’s words, with a person to ask', async () => {
    signIn();
    photoFetch({
      answer: () => jsonResponse(422, { code: 'PHOTO_REJECTED', message: 'profile photo rejected by moderation', reason: 'sexual', reviewId: 'rv-3' }),
    });
    const onChanged = vi.fn();
    renderApp(<ProfilePhotoPicker me={me()} onChanged={onChanged} />);

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));

    expect(await screen.findByText('This picture looks like it shows nudity or sexual content, which isn’t allowed on Hevalo.')).toBeInTheDocument();
    expect(screen.queryByText(/rejected by moderation/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask a person to check' })).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('never shows the server’s English for a refusal that names no reason', async () => {
    signIn();
    photoFetch({ answer: () => jsonResponse(422, { code: 'PHOTO_REJECTED', message: 'profile photo rejected by moderation' }) });
    renderApp(<ProfilePhotoPicker me={me()} onChanged={() => undefined} />);

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));

    expect(await screen.findByText('This picture can’t be shared on Hevalo.')).toBeInTheDocument();
    expect(screen.queryByText(/rejected by moderation/)).not.toBeInTheDocument();
  });
});
