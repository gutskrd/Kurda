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
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const aPicture = () => new File([new Uint8Array([1, 2, 3])], 'me.png', { type: 'image/png' });

const me = (over: Partial<MeProfile> = {}): MeProfile =>
  ({ id: 'me', username: 'hamude', profilePhotoUrl: null, avatarUrl: null, ...over }) as MeProfile;

/** Answer the upload and record what was sent. */
function photoFetch(opts: { status?: number } = {}) {
  const calls: string[] = [];
  stubImage();
  stubCanvas();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/profile-picture')) {
        calls.push(`${init?.method ?? 'POST'} profile-picture`);
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
  /*
   * The whole point. A profile picture is shown in a circle at every size the
   * app uses it, so uploading one used to be a gamble on whatever the middle of
   * the file happened to be.
   */
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

    expect(await screen.findByRole('status')).toHaveTextContent(/storage isn’t configured/i);
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
});
