import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n/I18nProvider';
import { LEAVE_MS } from '../lib/motion';
import { Modal } from './Modal';
import { Sheet } from './Sheet';

/** A page that re-renders on its own, as a lobby does when its state arrives. */
function Page({ tick }: { tick: number }): React.JSX.Element {
  const [open, setOpen] = useState(true);
  useEffect(() => undefined, [tick]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {/* a fresh onClose on every render, as most callers pass one */}
      <Modal open={open} onClose={() => setOpen(false)} label="Invite friends">
        <input aria-label="Search your friends" />
        <span>tick {tick}</span>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('leaves the focus where the reader put it when the page beneath re-renders', async () => {
    const { rerender } = render(
      <I18nProvider>
        <Page tick={0} />
      </I18nProvider>,
    );
    const search = screen.getByRole('textbox', { name: 'Search your friends' });
    await userEvent.click(search);
    expect(search).toHaveFocus();

    act(() =>
      rerender(
        <I18nProvider>
          <Page tick={1} />
        </I18nProvider>,
      ),
    );
    expect(screen.getByText('tick 1')).toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it('keeps the keyboard inside: Tab past the last control comes back to the first, and the other way', async () => {
    render(
      <I18nProvider>
        <Page tick={0} />
      </I18nProvider>,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    const search = screen.getByRole('textbox', { name: 'Search your friends' });
    await userEvent.click(search);
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(search).toHaveFocus();
    // never out to the "open" button under the backdrop
    expect(screen.getByRole('button', { name: 'open' })).not.toHaveFocus();
  });

  it('still closes on Escape with the latest onClose', async () => {
    render(
      <I18nProvider>
        <Page tick={0} />
      </I18nProvider>,
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/** A dialog that starts closed and is opened from a button, which is where the focus has to go back to. */
function Opened({ sheet = false }: { sheet?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const Dialog = sheet ? Sheet : Modal;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Invite friends">
        {/* gone from the caller the moment it closes, as most callers write it */}
        {open && <p>Who do you want to invite?</p>}
      </Dialog>
    </>
  );
}

/** A browser that plays motion: it can be asked, and the reader has not asked for less. */
function withMotion(reduced = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe.each([
  ['a dialog', false],
  ['a sheet', true],
])('%s, closed', (_name, sheet) => {
  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal('matchMedia', undefined);
  });

  it('leaves the way it came: its picture stays a moment, but it is closed at once to everything that matters', async () => {
    withMotion();
    render(
      <I18nProvider>
        <Opened sheet={sheet} />
      </I18nProvider>,
    );
    const opener = screen.getByRole('button', { name: 'open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    // no dialog any more, to a screen reader or a test; the focus is back on what opened it
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    // what is still drawn is only a picture: its words are there, inert and hidden, on their way out
    const picture = screen.getByText('Who do you want to invite?').closest('.is-leaving');
    expect(picture).not.toBeNull();
    expect(picture).toHaveAttribute('inert');
    expect(picture).toHaveAttribute('aria-hidden', 'true');

    // and after one `--dur` it is gone altogether
    act(() => {
      vi.advanceTimersByTime(LEAVE_MS);
    });
    expect(screen.queryByText('Who do you want to invite?')).not.toBeInTheDocument();
  });

  it('is simply gone for a reader who asked for less motion', async () => {
    withMotion(true);
    render(
      <I18nProvider>
        <Opened sheet={sheet} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Who do you want to invite?')).not.toBeInTheDocument();
  });

  it('has one close button, a finger’s width across, and no grip to drag', async () => {
    render(
      <I18nProvider>
        <Opened sheet={sheet} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('close-btn');
    expect(document.querySelector('.sheet-grip')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
