import { StrictMode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PictureEditor } from './PostPicture';
import { renderApp } from '../test/utils';
import { stubCanvas, stubImage } from './canvasStubs';

/* The photo editor as the composer opens it for one picture; posting itself is tested in composer/Composer.test.tsx. */

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const aPicture = () => new File([new Uint8Array([1, 2, 3])], 'welat.png', { type: 'image/png' });

/** jsdom has neither a canvas nor an Image that loads, and the editor draws the picture. */
function uploadFetch(): void {
  stubImage();
  stubCanvas();
}

let done = vi.fn();
let cancel = vi.fn();

const show = (file: File = aPicture()) => {
  done = vi.fn();
  cancel = vi.fn();
  return renderApp(<PictureEditor file={file} handle="rojhat" onDone={done} onCancel={cancel} />);
};

/** Waits for the editor, which appears once the picture is decoded. */
async function pick(): Promise<void> {
  await screen.findByText('Edit your picture');
}

describe('PictureEditor', () => {
  it('gives back the edited picture as a file of its own', async () => {
    signIn();
    uploadFetch();
    const original = aPicture();
    show(original);
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));

    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    const edited = done.mock.calls[0]![0] as File;
    expect(edited).toBeInstanceOf(File);
    // The canvas export, not the bytes that came in.
    expect(edited).not.toBe(original);
  });

  it('takes a photo the operating system did not label', async () => {
    signIn();
    uploadFetch();
    // Many real photos arrive with an empty `type`, so it must not be judged by that.
    show(new File([new Uint8Array([1, 2, 3])], 'IMG_4021.JPG', { type: '' }));
    expect(await screen.findByText('Edit your picture')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('gives back the original for a picture this browser cannot draw', async () => {
    signIn();
    uploadFetch();
    stubImage({ fail: true });
    // A phone photo: the browser has no HEIC decoder, but the server does.
    const heic = new File([new Uint8Array([1, 2, 3])], 'IMG_4021.HEIC', { type: 'image/heic' });
    show(heic);

    // No editor, since nothing can be drawn, but it says so plainly.
    expect(await screen.findByText(/can’t show this kind of picture/i)).toBeInTheDocument();
    expect(screen.getByText('IMG_4021.HEIC')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));
    // The original bytes, not an export of a picture that never rendered.
    expect(done).toHaveBeenCalledWith(heic);
  });

  it('gives nothing back when cancelled', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
  });

  it('survives the double render the app actually runs under', async () => {
    signIn();
    uploadFetch();
    renderApp(
      <StrictMode>
        <PictureEditor file={aPicture()} handle="rojhat" onDone={() => undefined} onCancel={() => undefined} />
      </StrictMode>,
    );

    /*
     * StrictMode runs every effect mount, cleanup, mount in development, revoking the first run's object URL while its
     * image is still reading; that must not make the picture unreadable.
     */
    expect(await screen.findByText('Edit your picture')).toBeInTheDocument();
    expect(screen.queryByText(/can’t show this kind of picture/i)).not.toBeInTheDocument();
  });

  it('opens on framing, with something to frame with', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();

    expect(screen.getByText('Edit your picture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Frame' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByText(/Drag it to choose what/)).toBeInTheDocument();
  });

  it('offers the shapes a picture can be posted in', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();

    for (const shape of ['Original', 'Square', 'Portrait', 'Wide']) {
      expect(screen.getByRole('button', { name: shape })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says it is an editor, once there is something to edit', async () => {
    signIn();
    uploadFetch();
    show();

    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('button', { name: /Add words/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add a sticker/ })).toBeInTheDocument();
    // It says what to do while the picture is bare.
    expect(screen.getByText(/Add words or a sticker, or draw on it/)).toBeInTheDocument();
  });

  it('has nothing to take back until something is done', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add words/ }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('opens a picker instead of guessing which sticker you meant', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add a sticker/ }));

    expect(screen.getByText('Pick a sticker')).toBeInTheDocument();
    // Nothing has been put on the picture yet.
    expect(screen.queryByText('Sticker', { exact: true })).not.toBeInTheDocument();
  });

  it('adds the sticker that was actually clicked, and closes the picker', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add a sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Hevalo' }));

    expect(await screen.findByText('Sticker', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Pick a sticker')).not.toBeInTheDocument();
    // One step, so undo takes the whole sticker back.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('draws emoji from pictures, not from whatever font the machine has', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add a sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Emoji' }));

    const heart = screen.getByRole('button', { name: '❤️' });
    expect(heart.querySelector('img')).toHaveAttribute('src', '/emoji/2764.webp');
  });

  /** Chooses a picture, switches to Add, and places a sticker, which selects it. */
  async function placeSticker(): Promise<void> {
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add a sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Hevalo' }));
    await screen.findByText('Sticker', { exact: true });
  }

  it('shows the selected layer with handles to resize and turn it', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();

    const box = document.querySelector('.layer-box');
    expect(box).not.toBeNull();
    // Four corners to pull, and one above the top edge to turn by.
    expect(box!.querySelectorAll('.layer-handle')).toHaveLength(5);
    expect(box!.querySelector('.layer-handle-turn')).not.toBeNull();
  });

  it('takes the handles away when nothing is selected', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();
    expect(document.querySelector('.layer-box')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.layer-box')).toBeNull();
  });

  it('removes the selected layer with Delete', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();

    await userEvent.keyboard('{Delete}');
    expect(screen.queryByText('Sticker', { exact: true })).not.toBeInTheDocument();
    expect(document.querySelector('.layer-box')).toBeNull();
  });

  it('nudges the selected layer with the arrow keys', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();

    const left = () => (document.querySelector('.layer-box') as HTMLElement).style.left;
    const before = left();
    await userEvent.keyboard('{ArrowRight}');
    expect(left()).not.toBe(before);
    // One step to take back, not a hundred.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('duplicates and reorders, so two things on one spot are not stuck', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();

    // One layer: nothing to move it above or below.
    expect(screen.getByRole('button', { name: 'Bring forward' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    // The copy is on top, so it can go back but not further forward.
    expect(screen.getByRole('button', { name: 'Bring forward' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Send back' }));
    expect(screen.getByRole('button', { name: 'Bring forward' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeDisabled();
  });
});
