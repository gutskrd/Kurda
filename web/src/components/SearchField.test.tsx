import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n/I18nProvider';
import { SearchField } from './SearchField';
import { Sheet } from './Sheet';
import { Modal } from './Modal';

function Field({ start = '' }: { start?: string }): React.JSX.Element {
  const [value, setValue] = useState(start);
  return <SearchField icon value={value} onValueChange={setValue} aria-label="Search words" />;
}

const field = (): HTMLInputElement => screen.getByRole('searchbox', { name: 'Search words' });
const clearButton = (): HTMLElement | null => screen.queryByRole('button', { name: 'Clear search' });

describe('SearchField', () => {
  it('shows the clear button only while there is something to clear', async () => {
    render(
      <I18nProvider>
        <Field />
      </I18nProvider>,
    );
    expect(clearButton()).toBeNull();
    await userEvent.type(field(), 'silav');
    expect(clearButton()).not.toBeNull();
  });

  it('empties the field and leaves the cursor in it, ready for the next search', async () => {
    render(
      <I18nProvider>
        <Field />
      </I18nProvider>,
    );
    await userEvent.type(field(), 'silav');
    await userEvent.click(clearButton()!);
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
    expect(clearButton()).toBeNull();
    // and the next search starts straight away
    await userEvent.keyboard('rojbaş');
    expect(field()).toHaveValue('rojbaş');
  });

  it('does not take the focus from the field when pressed, so a phone keyboard stays up', async () => {
    render(
      <I18nProvider>
        <Field start="silav" />
      </I18nProvider>,
    );
    // fireEvent returns false when the default was prevented
    expect(fireEvent.mouseDown(clearButton()!)).toBe(false);
  });

  it('clears with Escape too, and an empty field leaves Escape alone', async () => {
    const onKeyDown = vi.fn();
    function Watched(): React.JSX.Element {
      const [value, setValue] = useState('silav');
      return (
        <div onKeyDown={onKeyDown}>
          <SearchField value={value} onValueChange={setValue} aria-label="Search words" />
        </div>
      );
    }
    render(
      <I18nProvider>
        <Watched />
      </I18nProvider>,
    );
    await userEvent.click(field());
    await userEvent.keyboard('{Escape}');
    expect(field()).toHaveValue('');
    expect(onKeyDown).not.toHaveBeenCalled();
    // nothing left to clear: the Escape goes on to whatever is around the field
    await userEvent.keyboard('{Escape}');
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it('is named for a screen reader, and so is its clear button', () => {
    render(
      <I18nProvider>
        <Field start="silav" />
      </I18nProvider>,
    );
    expect(field()).toHaveAttribute('type', 'search');
    expect(clearButton()).toHaveAttribute('type', 'button');
  });

  for (const [what, Dialog] of [
    ['a sheet', Sheet],
    ['a dialog', Modal],
  ] as const) {
    it(`in ${what}, the first Escape clears the field and the next one closes`, async () => {
      function Picker(): React.JSX.Element {
        const [open, setOpen] = useState(true);
        const [value, setValue] = useState('');
        return (
          <Dialog open={open} onClose={() => setOpen(false)} label="Invite friends">
            <SearchField value={value} onValueChange={setValue} aria-label="Search words" />
          </Dialog>
        );
      }
      render(
        <I18nProvider>
          <Picker />
        </I18nProvider>,
      );
      await userEvent.click(field());
      await userEvent.keyboard('rojda');
      await userEvent.keyboard('{Escape}');
      expect(field()).toHaveValue('');
      expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Invite friends' })).toBeNull();
    });
  }
});
