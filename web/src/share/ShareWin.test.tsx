import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareWin, shareOut } from './ShareWin';

/* Sharing a win: the device's share sheet where it has one, the clipboard where it has not. */

const TEXT = 'Look, I just finished a Kurdish lesson! Come learn with me on Hevalo 🍎\nhttps://hevalo.test/win/lesson?l=en';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A device with a share sheet (a phone's browser), answering as `share` does. */
function withSheet(share: (data: ShareData) => Promise<void>, writeText: (text: string) => Promise<void> = vi.fn(async () => undefined)): void {
  vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
}

/** A device with none (most desktops): only the clipboard. */
function withClipboard(writeText: (text: string) => Promise<void>): void {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
}

describe('handing a message out', () => {
  it('goes to the device’s sheet where there is one, whole, with the address inside the text', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    const writeText = vi.fn(async () => undefined);
    withSheet(share, writeText);
    expect(await shareOut(TEXT)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Hevalo', text: TEXT });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does nothing more when the sheet is put away: that is a choice, not a failure', async () => {
    const writeText = vi.fn(async () => undefined);
    withSheet(async () => {
      throw new DOMException('dismissed', 'AbortError');
    }, writeText);
    expect(await shareOut(TEXT)).toBe('dismissed');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the message when the sheet would not open', async () => {
    const writeText = vi.fn(async () => undefined);
    withSheet(async () => {
      throw new DOMException('refused', 'NotAllowedError');
    }, writeText);
    expect(await shareOut(TEXT)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it('copies the message where there is no sheet', async () => {
    const writeText = vi.fn(async () => undefined);
    withClipboard(writeText);
    expect(await shareOut(TEXT)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it('says so when neither could be done', async () => {
    withClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    expect(await shareOut(TEXT)).toBe('failed');
    // And where the browser has no clipboard at all.
    vi.stubGlobal('navigator', { ...navigator });
    expect(await shareOut(TEXT)).toBe('failed');
  });
});

describe('the Share button', () => {
  it('is one quiet button: the share mark, the word, and not the screen’s main action', () => {
    withClipboard(vi.fn(async () => undefined));
    render(<ShareWin text={TEXT} />);
    const button = screen.getByRole('button', { name: 'Share' });
    expect(button).toHaveClass('btn-secondary');
    expect(button).not.toHaveClass('btn-primary');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('hands its message to the sheet, and stays as it was', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    withSheet(share);
    render(<ShareWin text={TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: 'Hevalo', text: TEXT });
    // Nothing is shown after the sheet, and nothing is asked again.
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('copies the message on a device with no sheet, and says so in the button for a moment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => undefined);
    withClipboard(writeText);
    render(<ShareWin text={TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(await screen.findByRole('button', { name: 'Copied' })).toHaveClass('is-done');
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole('button', { name: 'Share' })).not.toHaveClass('is-done');
  });

  it('says nothing when the sheet was put away, or the clipboard refused', async () => {
    withSheet(async () => {
      throw new DOMException('dismissed', 'AbortError');
    });
    const { unmount } = render(<ShareWin text={TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    unmount();

    withClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    render(<ShareWin text={TEXT} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });
});
