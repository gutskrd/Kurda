// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api';
import { renderUi } from '../test/render';
import {
  ActionMenu,
  Badge,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Stat,
  Table,
  Tabs,
  Time,
  TOAST_MS,
  UserLink,
  describeError,
  duration,
  relativeTime,
  useDialogs,
  useToast,
  type Column,
} from './index';

interface Item {
  id: string;
  name: string;
  price: number;
}

const ITEMS: Item[] = [
  { id: 'a', name: 'Newroz background', price: 300 },
  { id: 'b', name: 'Kurdish tag', price: 500 },
  { id: 'c', name: 'Streak freeze', price: 100 },
];

const COLUMNS: Column<Item>[] = [
  { key: 'name', header: 'Item', cell: (i) => <strong>{i.name}</strong>, sort: (a, b) => a.name.localeCompare(b.name), card: 'title' },
  { key: 'price', header: 'Price', cell: (i) => i.price, sort: (a, b) => a.price - b.price, align: 'end' },
];

/**
 * Gives the table's box and the table a width, for as long as a test needs
 * them: jsdom lays nothing out, so both are 0 otherwise.
 */
function layout({ box, table }: { box: number; table: number }): () => void {
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('table-wrap') ? box : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'TABLE' ? table : 0;
    },
  });
  return () => {
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
  };
}

function names(): string[] {
  const table = screen.getByRole('table', { name: 'Shop items' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent ?? '');
}

describe('Table', () => {
  it('sorts by a heading, and says which way', async () => {
    const user = userEvent.setup();
    renderUi(<Table caption="Shop items" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} />);
    expect(names()).toEqual(['Newroz background', 'Kurdish tag', 'Streak freeze']);

    const price = screen.getByRole('columnheader', { name: /price/i });
    expect(price).toHaveAttribute('aria-sort', 'none');
    await user.click(within(price).getByRole('button'));
    expect(price).toHaveAttribute('aria-sort', 'ascending');
    expect(names()).toEqual(['Streak freeze', 'Newroz background', 'Kurdish tag']);
    await user.click(within(price).getByRole('button'));
    expect(price).toHaveAttribute('aria-sort', 'descending');
    expect(names()).toEqual(['Kurdish tag', 'Newroz background', 'Streak freeze']);
  });

  it('labels each cell for the phone card, except the one that heads it', () => {
    renderUi(<Table caption="Shop items" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} actions={() => <button>Edit</button>} />);
    const first = screen.getAllByRole('row')[1]!;
    const [title, price] = within(first).getAllByRole('cell');
    expect(title).not.toHaveAttribute('data-label');
    expect(title).toHaveClass('is-card-title');
    expect(price).toHaveAttribute('data-label', 'Price');
    expect(within(first).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('turns into cards sooner when it has many columns', () => {
    const { container } = renderUi(<Table caption="Shop items" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} wide />);
    expect(container.querySelector('.table-wrap')).toHaveClass('is-wide');
    renderUi(<Table caption="Tags" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} />);
    expect(screen.getByRole('table', { name: 'Tags' }).parentElement).not.toHaveClass('is-wide');
    // a few wide columns: cards a little later, so a laptop with the sidebar keeps the table
    renderUi(<Table caption="Cases" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} wide="medium" />);
    expect(screen.getByRole('table', { name: 'Cases' }).parentElement).toHaveClass('is-medium');
    expect(screen.getByRole('table', { name: 'Cases' }).parentElement).not.toHaveClass('is-wide');
  });

  it('is cards in a narrow box, and in a wide one its table would not fit — never cut off at the edge', () => {
    // jsdom lays nothing out: the box and the table are given their widths
    const restore = layout({ box: 1000, table: 800 });
    try {
      const { container } = renderUi(<Table caption="Shop items" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} />);
      expect(container.querySelector('.table-wrap')).not.toHaveClass('is-cards');
    } finally {
      restore();
    }
    const tooWide = layout({ box: 1000, table: 1200 });
    try {
      const { container } = renderUi(<Table caption="Long names" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} />);
      expect(container.querySelector('.table-wrap')).toHaveClass('is-cards');
      // the cards still say what each value is
      expect(within(screen.getByRole('table', { name: 'Long names' })).getAllByRole('cell')[1]).toHaveAttribute('data-label', 'Price');
    } finally {
      tooWide();
    }
    const narrow = layout({ box: 500, table: 400 });
    try {
      const { container } = renderUi(<Table caption="On a phone" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} />);
      expect(container.querySelector('.table-wrap')).toHaveClass('is-cards');
    } finally {
      narrow();
    }
  });

  it('turns into cards at the width its columns need', () => {
    const restore = layout({ box: 900, table: 800 });
    try {
      renderUi(<Table caption="Many" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} wide />);
      renderUi(<Table caption="A few wide" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} wide="medium" />);
      expect(screen.getByRole('table', { name: 'Many' }).parentElement).toHaveClass('is-cards');
      expect(screen.getByRole('table', { name: 'A few wide' }).parentElement).not.toHaveClass('is-cards');
    } finally {
      restore();
    }
  });

  it('keeps a scrolling table a table, pinning its first column only while it scrolls', () => {
    const narrow = layout({ box: 340, table: 430 });
    try {
      renderUi(<Table caption="Day by day" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} layout="scroll" />);
      const box = screen.getByRole('table', { name: 'Day by day' }).parentElement!;
      expect(box).toHaveClass('is-scroll', 'is-scrolling');
      expect(box).not.toHaveClass('is-cards');
    } finally {
      narrow();
    }
    const wide = layout({ box: 900, table: 600 });
    try {
      renderUi(<Table caption="Fits" columns={COLUMNS} rows={ITEMS} rowKey={(i) => i.id} layout="scroll" />);
      expect(screen.getByRole('table', { name: 'Fits' }).parentElement).not.toHaveClass('is-scrolling');
    } finally {
      wide();
    }
  });

  it('says it is loading, rather than drawing an empty table', () => {
    const { container } = renderUi(<Table caption="Shop items" columns={COLUMNS} rows={null} rowKey={(i) => i.id} />);
    expect(within(container).getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('says when there is nothing, in its own words', () => {
    renderUi(<Table caption="Shop items" columns={COLUMNS} rows={[]} rowKey={(i) => i.id} empty="No items yet." />);
    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('shows a failure as a failure — never as an empty list — and retries', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { container } = renderUi(
      <Table
        caption="Shop items"
        columns={COLUMNS}
        rows={[]}
        rowKey={(i) => i.id}
        empty="No items yet."
        error={new ApiError(500, 'INTERNAL', 'boom', undefined, { requestId: 'req-9' })}
        onRetry={retry}
      />,
    );
    expect(screen.queryByText('No items yet.')).not.toBeInTheDocument();
    expect(within(container).getByRole('alert')).toHaveTextContent('The server had a problem');
    expect(screen.getByText(/req-9/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('pages, with the range in words', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    renderUi(
      <Table
        caption="Shop items"
        columns={COLUMNS}
        rows={ITEMS}
        rowKey={(i) => i.id}
        paging={{ page: 0, pageCount: 3, onPage, total: 120, pageSize: 50 }}
      />,
    );
    expect(screen.getByText('1–50 of 120')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onPage).toHaveBeenCalledWith(1);
  });
});

describe('ErrorState', () => {
  it('tells "your role can’t" from "enter your 2FA code" from a failure', () => {
    const { container, unmount } = renderUi(
      <ErrorState error={new ApiError(403, 'FORBIDDEN', 'insufficient permissions')} what="the shop" onRetry={() => {}} />,
    );
    expect(within(container).getByRole('alert')).toHaveTextContent('Your role can’t open this');
    expect(within(container).getByRole('alert')).toHaveTextContent('doesn’t include the shop');
    // retrying will not change a role
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    unmount();

    const again = renderUi(<ErrorState error={new ApiError(403, 'TOTP_REQUIRED', 'enter your 2FA code to continue')} />);
    expect(within(again.container).getByRole('alert')).toHaveTextContent('Enter your 2FA code again');
    expect(screen.getByRole('button', { name: 'Enter a code' })).toBeInTheDocument();
  });

  it('names a lost connection as one', () => {
    expect(describeError(new TypeError('Failed to fetch')).kind).toBe('offline');
    expect(describeError(new ApiError(403, 'TOTP_ENROLLMENT_REQUIRED', 'x')).kind).toBe('two_factor_setup');
    expect(describeError(new ApiError(409, 'CONFLICT', 'lesson changed since you loaded it')).message).toBe(
      'Lesson changed since you loaded it.',
    );
    expect(describeError(new ApiError(422, 'INVALID', 'invalid exercises')).kind).toBe('invalid');
  });

  it('says a refusal about who is acting is not about the role', () => {
    const d = describeError(new ApiError(403, 'CONFLICT_OF_INTEREST', 'you are part of this case; another moderator must handle it'));
    expect(d.kind).toBe('conflict');
    expect(d.title).toBe('Another moderator has to do this');
    expect(d.message).toBe('You are part of this case; another moderator must handle it.');
    expect(describeError(new ApiError(403, 'SAME_ADMIN', 'a second admin has to confirm this ban')).kind).toBe('conflict');
  });
});

describe('ConfirmDialog', () => {
  function Harness({ typed, onAnswer }: { typed?: string; onAnswer: (yes: boolean) => void }): React.JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Ban</button>
        <ConfirmDialog
          open={open}
          options={{
            title: 'Ban @rojda for good?',
            body: 'They can no longer sign in.',
            confirmLabel: 'Ban for good',
            tone: 'danger',
            typed: typed ? { phrase: typed } : undefined,
          }}
          onAnswer={(yes) => {
            setOpen(false);
            onAnswer(yes);
          }}
        />
      </>
    );
  }

  it('asks for the typed confirmation before a destructive action', async () => {
    const user = userEvent.setup();
    const answer = vi.fn();
    renderUi(<Harness typed="rojda" onAnswer={answer} />);
    await user.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Ban @rojda for good?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const confirm = within(dialog).getByRole('button', { name: 'Ban for good' });
    expect(confirm).toBeDisabled();
    const input = within(dialog).getByLabelText(/type rojda to confirm/i);
    expect(input).toHaveFocus();
    await user.type(input, 'rojd');
    expect(confirm).toBeDisabled();
    await user.type(input, 'a');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(answer).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('closes on Escape as a "no", gives focus back, and keeps the page behind it out of reach', async () => {
    const user = userEvent.setup();
    const answer = vi.fn();
    const { container } = renderUi(<Harness onAnswer={answer} />);
    const opener = screen.getByRole('button', { name: 'Ban' });
    await user.click(opener);
    // a danger question starts on the safe answer
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(container).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(answer).toHaveBeenCalledWith(false);
    expect(container).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderUi(<Harness onAnswer={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = screen.getByRole('alertdialog');
    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

describe('useDialogs', () => {
  function Page(): React.JSX.Element {
    const dialogs = useDialogs();
    const [said, setSaid] = useState('');
    return (
      <>
        <button
          onClick={async () => {
            const yes = await dialogs.confirm({ title: 'Remove “heval”?', confirmLabel: 'Remove', tone: 'danger' });
            setSaid(yes ? 'removed' : 'kept');
          }}
        >
          Remove
        </button>
        <button
          onClick={async () => {
            const name = await dialogs.prompt({ title: 'Rename “heval”', label: 'New name', initial: 'heval' });
            setSaid(name ?? 'cancelled');
          }}
        >
          Rename
        </button>
        <output>{said}</output>
      </>
    );
  }

  it('answers a confirm and a prompt as promises, the way the old browser dialogs were called', async () => {
    const user = userEvent.setup();
    renderUi(<Page />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('removed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('New name');
    expect(field).toHaveValue('heval');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // an empty name is not sent
    expect(screen.getByText('This can’t be empty.')).toBeInTheDocument();
    await user.type(field, 'hevalê');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('hevalê')).toBeInTheDocument();
  });

  it('lets a page’s own check replace the "can’t be empty" one, so a note can be emptied', async () => {
    const user = userEvent.setup();
    function NotePage(): React.JSX.Element {
      const dialogs = useDialogs();
      const [said, setSaid] = useState('');
      return (
        <>
          <button
            onClick={async () => {
              const note = await dialogs.prompt({ title: 'Edit the note', label: 'Note', initial: 'old', validate: () => null });
              setSaid(note === null ? 'cancelled' : `saved “${note}”`);
            }}
          >
            Edit
          </button>
          <output>{said}</output>
        </>
      );
    }
    renderUi(<NotePage />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Note'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('saved “”')).toBeInTheDocument();
  });

  it('asks a dangerous change with a reason as an alert a stray tap cannot close', async () => {
    const user = userEvent.setup();
    function VoidPage(): React.JSX.Element {
      const dialogs = useDialogs();
      const [said, setSaid] = useState('');
      return (
        <>
          <button
            onClick={async () => {
              const why = await dialogs.prompt({ title: 'Void this game?', label: 'Why', confirmLabel: 'Void it', tone: 'danger', multiline: true });
              setSaid(why ?? 'cancelled');
            }}
          >
            Void
          </button>
          <output>{said}</output>
        </>
      );
    }
    renderUi(<VoidPage />);
    await user.click(screen.getByRole('button', { name: 'Void' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Void this game?' });
    expect(within(dialog).getByRole('button', { name: 'Void it' })).toHaveClass('danger-solid');
    await user.type(within(dialog).getByLabelText('Why'), 'win trading');
    await user.click(document.querySelector('.layer-scrim')!);
    // still open, with what was typed
    expect(within(screen.getByRole('alertdialog')).getByLabelText('Why')).toHaveValue('win trading');
    await user.click(within(dialog).getByRole('button', { name: 'Void it' }));
    expect(await screen.findByText('win trading')).toBeInTheDocument();
  });
});

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  function Page(): React.JSX.Element {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast.success('Saved.')}>Save</button>
        <button onClick={() => toast.error('Could not save: the server had a problem.')}>Fail</button>
      </>
    );
  }

  it('says news politely and failures assertively, then lets them go', () => {
    renderUi(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    const polite = document.querySelector('.toast-region[aria-live="polite"]') as HTMLElement;
    const assertive = document.querySelector('.toast-region[aria-live="assertive"]') as HTMLElement;
    expect(polite).toHaveAttribute('role', 'status');
    expect(assertive).toHaveAttribute('role', 'alert');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(polite).toHaveTextContent('Saved.');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(assertive).toHaveTextContent('Could not save');

    act(() => vi.advanceTimersByTime(TOAST_MS.success + 10));
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
    // a failure stays longer
    expect(screen.getByText(/Could not save/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TOAST_MS.error));
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
  });

  it('can be dismissed', () => {
    renderUi(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });
});

describe('Drawer', () => {
  it('opens as a labelled dialog and closes on Escape', async () => {
    const user = userEvent.setup();
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Drawer open={open} onClose={() => setOpen(false)} title="Edit item">
            <input aria-label="Name" />
          </Drawer>
        </>
      );
    }
    renderUi(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit item' });
    expect(within(drawer).getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});

describe('Tabs', () => {
  it('brings the chosen tab into view when the row scrolls sideways', () => {
    // a phone's row: 300 px showing of 600, each tab 140 px wide and 150 apart
    const scrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')!;
    const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!;
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
    const rect = Element.prototype.getBoundingClientRect;
    const isRow = (el: Element): boolean => el.getAttribute('role') === 'tablist';
    Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get() { return isRow(this) ? 600 : 0; } });
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return isRow(this) ? 300 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.getAttribute('role') === 'tab' ? 140 : 0; } });
    Element.prototype.getBoundingClientRect = function at(this: Element): DOMRect {
      const i = this.getAttribute('role') === 'tab' ? [...this.parentElement!.children].indexOf(this) : 0;
      return new DOMRect(i * 150, 0, this.getAttribute('role') === 'tab' ? 140 : 300, 44);
    };
    try {
      renderUi(
        <Tabs
          label="Family"
          value="events"
          items={[
            { key: 'all', label: 'All' },
            { key: 'learning', label: 'Learning' },
            { key: 'games', label: 'Games' },
            { key: 'events', label: 'Events' },
          ]}
        />,
      );
      // the fourth tab starts at 450: centred in the 300 px that show
      expect(screen.getByRole('tablist', { name: 'Family' }).scrollLeft).toBe(370);
    } finally {
      Object.defineProperty(Element.prototype, 'scrollWidth', scrollWidth);
      Object.defineProperty(Element.prototype, 'clientWidth', clientWidth);
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
      Element.prototype.getBoundingClientRect = rect;
    }
  });

  it('moves with the arrow keys and chooses as it goes', async () => {
    const user = userEvent.setup();
    function Harness(): React.JSX.Element {
      const [value, setValue] = useState<'missing' | 'recorded' | 'all'>('missing');
      return (
        <Tabs
          label="Show"
          value={value}
          onChange={setValue}
          items={[
            { key: 'missing', label: 'Still to record', count: 12 },
            { key: 'recorded', label: 'Recorded', count: 40 },
            { key: 'all', label: 'All' },
          ]}
        />
      );
    }
    renderUi(<Harness />);
    const list = screen.getByRole('tablist', { name: 'Show' });
    const [missing, recorded, all] = within(list).getAllByRole('tab');
    expect(missing).toHaveAttribute('aria-selected', 'true');
    expect(missing).toHaveTextContent('Still to record12');
    // only the chosen tab is in the Tab order
    expect(recorded).toHaveAttribute('tabindex', '-1');
    missing!.focus();
    await user.keyboard('{ArrowRight}');
    expect(recorded).toHaveFocus();
    expect(recorded).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(all).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(missing).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Field', () => {
  it('names the control with its label and describes it with the hint and the error', () => {
    renderUi(
      <Field label="SKU" hint="Letters, digits and _" error="Already used" required>
        <input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /sku/i });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Letters, digits and _ Already used');
  });

  it('gives a checkbox a label you can click', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    renderUi(<Checkbox label="On sale" hint="Buyable now" checked={false} onChange={change} />);
    await user.click(screen.getByText('On sale'));
    expect(change).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'On sale' })).toHaveAccessibleDescription('Buyable now');
  });
});

describe('ActionMenu', () => {
  it('opens a menu the keyboard can walk, and closes back to its button', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    renderUi(
      <ActionMenu
        label="More actions for heval"
        items={[
          { label: 'Rename', onSelect: () => {} },
          { label: 'Delete', onSelect: remove, tone: 'danger' },
        ]}
      />,
    );
    const button = screen.getByRole('button', { name: 'More actions for heval' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe('UserLink', () => {
  it('links to the person’s page and shows when they are a minor', () => {
    renderUi(<UserLink user={{ id: 'u-1', username: 'rojda' }} minor />);
    expect(screen.getByRole('link', { name: '@rojda' })).toHaveAttribute('href', '#/users/u-1');
    expect(screen.getByText('Minor')).toBeInTheDocument();
  });

  it('says when the account is gone', () => {
    renderUi(<UserLink user={null} />);
    expect(screen.getByText('Deleted account')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('Time', () => {
  it('says how long ago, and keeps the exact time in the markup', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(relativeTime(new Date('2026-10-13T11:59:40Z'), now)).toBe('just now');
    expect(relativeTime(new Date('2026-10-13T11:35:00Z'), now)).toBe('25 min ago');
    expect(relativeTime(new Date('2026-10-13T09:00:00Z'), now)).toBe('3 h ago');
    expect(relativeTime(new Date('2026-10-12T10:00:00Z'), now)).toBe('yesterday');
    expect(relativeTime(new Date('2026-10-09T12:00:00Z'), now)).toBe('4 days ago');
    expect(relativeTime(new Date('2026-10-13T14:00:00Z'), now)).toBe('in 2 h');
    expect(duration(45)).toBe('45 s');
    expect(duration(3 * 3600 + 300)).toBe('3 h 5 min');
    expect(duration(5 * 86400)).toBe('5 days');

    renderUi(<Time value="2026-10-13T09:00:00Z" />);
    const time = document.querySelector('time')!;
    expect(time).toHaveAttribute('dateTime', '2026-10-13T09:00:00.000Z');
    expect(time.getAttribute('title')).toMatch(/2026/);
  });
});

describe('the small parts', () => {
  it('a page heading is the page’s h1, with its actions', () => {
    renderUi(<PageHeader title="Shop" subtitle="What is on sale" actions={<button>New item</button>} meta={<Badge tone="ok">Live</Badge>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New item' })).toBeInTheDocument();
    expect(screen.getByText('Live')).toHaveClass('badge', 'ok');
  });

  it('a tile with somewhere to go is a link', () => {
    renderUi(<Stat label="Still to record" value={12} href="#/audio/lessons?show=missing" />);
    expect(screen.getByRole('link', { name: /still to record/i })).toHaveAttribute('href', '#/audio/lessons?show=missing');
  });

  it('an empty state says what to do next', () => {
    renderUi(<EmptyState title="No stories yet" action={<button>New story</button>} />);
    expect(screen.getByText('No stories yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New story' })).toBeInTheDocument();
  });
});

describe('useLoad', () => {
  it('keeps the newest answer when an older one arrives late', async () => {
    const { useLoad } = await import('./hooks');
    const answers: Array<(v: string) => void> = [];
    function Search({ q }: { q: string }): React.JSX.Element {
      const { data } = useLoad(() => new Promise<string>((resolve) => answers.push(() => resolve(`results for ${q}`))), [q]);
      return <output>{data ?? ''}</output>;
    }
    const { rerender } = renderUi(<Search q="hev" />);
    rerender(<Search q="heval" />);
    // the second request answers first, then the first one straggles in
    await act(async () => answers[1]!(''));
    await act(async () => answers[0]!(''));
    await waitFor(() => expect(document.querySelector('output')).toHaveTextContent('results for heval'));
  });
});
