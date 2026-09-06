import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmButton } from './ConfirmButton';

afterEach(() => vi.restoreAllMocks());

describe('ConfirmButton', () => {
  it('does nothing on the first press', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" title="Delete this post" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button'));
    expect(onConfirm).not.toHaveBeenCalled();
    // and says so, rather than looking like nothing happened
    expect(screen.getByRole('button').textContent).toBe('Sure?');
  });

  it('does the thing on the second', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" title="Delete this post" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says what it will do, and then that it is asking', async () => {
    render(<ConfirmButton label="Delete" title="Delete this post" onConfirm={() => undefined} />);

    const button = screen.getByRole('button', { name: 'Delete this post' });
    await userEvent.click(button);
    // the icon-only version has no text to read, so the label carries it
    expect(screen.getByRole('button', { name: /press again to confirm/ })).toBeInTheDocument();
  });

  it('disarms when you look away, so it cannot catch a stray click later', async () => {
    const onConfirm = vi.fn();
    render(
      <>
        <ConfirmButton label="Delete" title="Delete this post" onConfirm={onConfirm} />
        <button type="button">somewhere else</button>
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete this post' }));
    await userEvent.click(screen.getByRole('button', { name: 'somewhere else' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete this post' }).textContent).toBe('Delete'));
  });

  // fireEvent rather than userEvent below: userEvent drives its own timers, which
  // deadlocks against a fake clock and against a promise held open on purpose.
  it('disarms on its own after a few seconds', async () => {
    vi.useFakeTimers();
    try {
      render(<ConfirmButton label="Delete" title="Delete this post" onConfirm={() => undefined} />);
      const button = screen.getByRole('button');

      fireEvent.click(button);
      expect(button.textContent).toBe('Sure?');

      // a half-pressed Delete should not sit there indefinitely
      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
      expect(button.textContent).toBe('Delete');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is held shut while it is working, so it cannot fire twice', async () => {
    let resolve: (() => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<ConfirmButton label="Delete" busyLabel="…" title="Delete this post" onConfirm={onConfirm} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);

    resolve?.();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
