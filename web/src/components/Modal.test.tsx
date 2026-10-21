import { describe, it, expect } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n/I18nProvider';
import { Modal } from './Modal';

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
