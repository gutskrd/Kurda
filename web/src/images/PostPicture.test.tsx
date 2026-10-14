import { StrictMode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PictureEditor } from './PostPicture';
import { renderApp } from '../test/utils';
import { stubCanvas, stubImage } from './canvasStubs';

/*
 * The photo editor, as the composer opens it for one picture (web/src/composer).
 * It used to be the whole picture composer — choose, edit, caption, post — and
 * these tests posted through it; posting is the composer's now and is tested
 * there (composer/Composer.test.tsx). What stays here is the editor: it takes
 * a picture and gives back the edited one, or the original when the browser
 * cannot draw it.
 */

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
  return renderApp(<PictureEditor file={file} handle="hamude" onDone={done} onCancel={cancel} />);
};

/** Wait for the editor to appear (the picture is decoded first). */
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
    // the canvas export, not the bytes that came in
    expect(edited).not.toBe(original);
  });

  it('takes a photo the operating system did not label', async () => {
    signIn();
    uploadFetch();
    // plenty of real photos arrive with an empty `type`; judging by that string
    // turned them away before anything had tried to read them
    show(new File([new Uint8Array([1, 2, 3])], 'IMG_4021.JPG', { type: '' }));
    expect(await screen.findByText('Edit your picture')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('gives back the original for a picture this browser cannot draw', async () => {
    signIn();
    uploadFetch();
    stubImage({ fail: true });
    // a phone photo: the browser has no HEIC decoder, but the server does
    const heic = new File([new Uint8Array([1, 2, 3])], 'IMG_4021.HEIC', { type: 'image/heic' });
    show(heic);

    // no editor — there is nothing on screen to put a sticker on — but it says so plainly
    expect(await screen.findByText(/can’t show this kind of picture/i)).toBeInTheDocument();
    expect(screen.getByText('IMG_4021.HEIC')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Use this picture' }));
    // the original bytes, not a canvas export of a picture that never rendered
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
        <PictureEditor file={aPicture()} handle="hamude" onDone={() => undefined} onCancel={() => undefined} />
      </StrictMode>,
    );

    /*
     * The app is wrapped in StrictMode, so in development every effect here runs
     * mount → cleanup → mount, and the cleanup revokes the first run's object URL
     * while its image is still reading from it. A picture must not be judged
     * unreadable on the strength of that.
     */
    expect(await screen.findByText('Edit your picture')).toBeInTheDocument();
    expect(screen.queryByText(/can’t show this kind of picture/i)).not.toBeInTheDocument();
  });

  /*
   * Framing is the first decision — which part of this did you mean — so it is
   * the tab the editor opens on, before anything can be put on top.
   */
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

    // before: four unlabelled grey words under the photo, and no panel until you
    // had both added a layer and selected one — so it looked finished on arrival
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('button', { name: /Add words/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add a sticker/ })).toBeInTheDocument();
    // and it says what to do while the picture is still bare
    expect(screen.getByText(/Add words or a sticker, or draw on it/)).toBeInTheDocument();
  });

  /*
   * The point of undo is that it is there before you need it and off until you
   * do — a live Undo button on an untouched picture is a lie about what it can
   * take back.
   */
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

  /**
   * Adding a sticker used to drop a fixed one onto the picture and leave you to
   * hunt for the grid that turned it into the one you wanted — two steps, in
   * the wrong order, with the wrong sticker on your photograph in between.
   */
  it('opens a picker instead of guessing which sticker you meant', async () => {
    signIn();
    uploadFetch();
    show();
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add a sticker/ }));

    expect(screen.getByText('Pick a sticker')).toBeInTheDocument();
    // and nothing has been put on the picture yet
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
    // and it is one step, so undo takes the whole sticker back
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  /**
   * Emoji used to be drawn as text in whichever font the writer's machine had,
   * so the same post came out with Segoe's emoji from Windows and Apple's from
   * a Mac. They are pictures now, served from this origin.
   */
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

  /** Choose a picture, switch to Add, and place a sticker (which selects it). */
  async function placeSticker(): Promise<void> {
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: /Add a sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Hevalo' }));
    await screen.findByText('Sticker', { exact: true });
  }

  /**
   * Before this there was no way to tell what was selected except by noticing
   * which panel had appeared underneath, and the only way to resize or turn
   * something was to leave the picture and find a slider.
   */
  it('shows the selected layer with handles to resize and turn it', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();

    const box = document.querySelector('.layer-box');
    expect(box).not.toBeNull();
    // four corners to pull, and one above the top edge to turn by
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
    // and it is a step you can take back, not a hundred
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('duplicates and reorders, so two things on one spot are not stuck', async () => {
    signIn();
    uploadFetch();
    show();
    await placeSticker();

    // one layer: nothing to move it above or below
    expect(screen.getByRole('button', { name: 'Bring forward' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    // the copy is on top, so it can go back but not further forward
    expect(screen.getByRole('button', { name: 'Bring forward' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Send back' }));
    expect(screen.getByRole('button', { name: 'Bring forward' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeDisabled();
  });
});
