import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n/I18nProvider';
import { LEAVE_MS } from '../lib/motion';
import { RECENT_MS, watchOpeners } from '../lib/opener';
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
      {/* A fresh onClose on every render, as most callers pass one. */}
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
    // Never out to the "open" button under the backdrop.
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

/** A dialog that starts closed and is opened from a button, where focus must return. */
function Opened({ sheet = false }: { sheet?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const Dialog = sheet ? Sheet : Modal;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Invite friends">
        {/* Gone from the caller the moment it closes, as most callers write it. */}
        {open && <p>Who do you want to invite?</p>}
      </Dialog>
    </>
  );
}

/** A browser that plays motion, or one with reduced motion. */
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
    // No dialog any more, to a screen reader or a test; focus is back on the opener.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    // What is still drawn is only a picture: inert and hidden, on its way out.
    const picture = screen.getByText('Who do you want to invite?').closest('.is-leaving');
    expect(picture).not.toBeNull();
    expect(picture).toHaveAttribute('inert');
    expect(picture).toHaveAttribute('aria-hidden', 'true');

    // After one `--dur` it is gone.
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

describe('where a dialog comes from', () => {
  let stop: () => void = () => undefined;

  beforeEach(() => {
    stop = watchOpeners();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.stubGlobal('matchMedia', undefined);
  });

  /** The panel of whatever is open, or still leaving. */
  const panel = (): HTMLElement => document.querySelector<HTMLElement>('.modal-panel, .sheet-panel')!;

  it('grows out of the point that was pressed to open it', () => {
    withMotion();
    render(
      <I18nProvider>
        <Opened />
      </I18nProvider>,
    );
    // Without layout the panel rests at the window's corner with no size, so its middle is that corner.
    fireEvent.click(screen.getByRole('button', { name: 'open' }), { clientX: 310, clientY: 620, detail: 1 });
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBe(panel());
    expect(panel()).toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('calc(50% + 310px) calc(50% + 620px)');
  });

  it('grows out of the control the keyboard was on', () => {
    withMotion();
    render(
      <I18nProvider>
        <Opened />
      </I18nProvider>,
    );
    const opener = screen.getByRole('button', { name: 'open' });
    const drawn = { left: 40, top: 700, right: 140, bottom: 740, width: 100, height: 40, x: 40, y: 700, toJSON: () => ({}) };
    opener.getBoundingClientRect = () => drawn as DOMRect;
    opener.focus();
    // Enter on a button reaches the page as a click at no point.
    fireEvent.click(opener, { clientX: 0, clientY: 0, detail: 0 });
    expect(panel()).toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('calc(50% + 90px) calc(50% + 720px)');
  });

  it('goes back to where it came from: the picture that leaves keeps the same point', () => {
    withMotion();
    render(
      <I18nProvider>
        <Opened />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }), { clientX: 310, clientY: 620, detail: 1 });
    vi.useFakeTimers();
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(panel().closest('.is-leaving')).not.toBeNull();
    expect(panel()).toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('calc(50% + 310px) calc(50% + 620px)');
  });

  it('rises in the middle, as it always did, when nothing opened it', () => {
    withMotion();
    // A dialog that is simply there: a badge earned, a warning.
    render(
      <I18nProvider>
        <Page tick={0} />
      </I18nProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).not.toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('');
  });

  it('rises in the middle when it arrives by itself, long after the last press', () => {
    withMotion();
    vi.useFakeTimers();
    /** A dialog the page opens by itself, not from a press. */
    const arrives = (open: boolean): React.JSX.Element => (
      <I18nProvider>
        <Modal open={open} onClose={() => undefined} label="A badge earned">
          <p>Well done</p>
        </Modal>
      </I18nProvider>
    );
    const { rerender } = render(arrives(false));
    fireEvent.click(document.body, { clientX: 310, clientY: 620, detail: 1 });
    vi.advanceTimersByTime(RECENT_MS + 100);
    act(() => rerender(arrives(true)));
    expect(screen.getByRole('dialog', { name: 'A badge earned' })).not.toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('');
  });

  it('does not grow from anywhere for a reader who asked for less motion', () => {
    withMotion(true);
    render(
      <I18nProvider>
        <Opened />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }), { clientX: 310, clientY: 620, detail: 1 });
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).not.toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('');
  });

  it('is not asked of a sheet, which comes from the bottom edge whatever opened it', () => {
    withMotion();
    render(
      <I18nProvider>
        <Opened sheet />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }), { clientX: 310, clientY: 620, detail: 1 });
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toHaveClass('sheet-panel');
    expect(panel()).not.toHaveClass('is-from-opener');
    expect(panel().style.transformOrigin).toBe('');
  });
});
