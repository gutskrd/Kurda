import { beforeAll, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MessageList } from './MessageList';
import { I18nProvider } from '../i18n/I18nProvider';
import { preloadCatalogue } from '../i18n/catalogues';

/** Local-time ISO, so the test does not depend on the runner's timezone. */
const at = (h: number, m: number): string => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const msg = (id: string, senderId: string, body: string, iso: string, extra = {}) => ({
  id,
  senderId,
  body,
  createdAt: iso,
  ...extra,
});

/** jsdom has no PointerEvent: a mouse event that says what kind of pointer it was, and how far it moved. */
class TestPointerEvent extends MouseEvent {
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    Object.defineProperty(this, 'pointerType', { value: init.pointerType ?? 'mouse', configurable: true, writable: true });
    Object.defineProperty(this, 'movementX', { value: init.movementX ?? 0, configurable: true, writable: true });
    Object.defineProperty(this, 'movementY', { value: init.movementY ?? 0, configurable: true, writable: true });
  }
}
beforeAll(() => {
  if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
});

/** MessageBody renders game-invite links, which are react-router Links. */
const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('MessageList', () => {
  it('names a group sender once per burst, not once per message', () => {
    show(
      <MessageList
        messages={[
          msg('1', 'u2', 'first', at(10, 0), { username: 'zana' }),
          msg('2', 'u2', 'second', at(10, 1), { username: 'zana' }),
          msg('3', 'u2', 'third', at(10, 2), { username: 'zana' }),
        ]}
        myId="me"
      />,
    );
    expect(screen.getAllByText('zana')).toHaveLength(1);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
  });

  it('names the sender in a one-to-one thread too', () => {
    // Snapchat-style: every burst says who wrote it, in both kinds of thread
    show(<MessageList messages={[msg('1', 'u2', 'hello', at(10, 0), { username: 'zana' })]} myId="me" />);
    expect(screen.getByText('zana')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('labels your own run as You', () => {
    show(<MessageList messages={[msg('1', 'me', 'mine', at(10, 0), { username: 'hamude' })]} myId="me" />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('shows one avatar per burst, at its start, and none on your own', () => {
    const { container } = show(
      <MessageList
        messages={[
          msg('1', 'u2', 'a', at(10, 0), { username: 'zana', avatarUrl: 'https://img/z.png' }),
          msg('2', 'u2', 'b', at(10, 1), { username: 'zana', avatarUrl: 'https://img/z.png' }),
          msg('3', 'me', 'mine', at(10, 30), { username: 'hamude' }),
        ]}
        myId="me"
      />,
    );
    // two bubbles from zana, one avatar — a face beside every line is noise
    expect(container.querySelectorAll('.chat-run-avatar')).toHaveLength(1);
    expect(container.querySelector('.chat-run-avatar img')?.getAttribute('src')).toBe('https://img/z.png');
  });

  it('opens a profile from the avatar', async () => {
    const onOpenProfile = vi.fn();
    show(
      <MessageList
        messages={[msg('1', 'u2', 'hi', at(10, 0), { username: 'zana' })]}
        myId="me"
        onOpenProfile={onOpenProfile}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /zana.s profile/i }));
    expect(onOpenProfile).toHaveBeenCalledWith('u2', 'zana');
  });

  it('marks your own run so it can be aligned and coloured differently', () => {
    const { container } = show(
      <MessageList messages={[msg('1', 'me', 'mine', at(10, 0)), msg('2', 'u2', 'theirs', at(10, 30))]} myId="me" />,
    );
    const runs = [...container.querySelectorAll('.chat-run')];
    expect(runs).toHaveLength(2);
    expect(runs[0]!.className).toContain('mine');
    expect(runs[1]!.className).not.toContain('mine');
  });

  it('gives only the last bubble of a burst a tail', () => {
    const { container } = show(
      <MessageList messages={[msg('1', 'u2', 'a', at(10, 0)), msg('2', 'u2', 'b', at(10, 1))]} myId="me" />,
    );
    const bubbles = [...container.querySelectorAll('.bubble')];
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]!.className).not.toContain('bubble-tail');
    expect(bubbles[1]!.className).toContain('bubble-tail');
  });

  it('shows one timestamp per burst rather than one per message', () => {
    const { container } = show(
      <MessageList
        messages={[msg('1', 'u2', 'a', at(10, 0)), msg('2', 'u2', 'b', at(10, 1)), msg('3', 'u2', 'c', at(10, 2))]}
        myId="me"
      />,
    );
    expect(container.querySelectorAll('.chat-run-meta')).toHaveLength(1);
    expect(container.querySelectorAll('time')).toHaveLength(1);
  });

  it('separates days', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 0, 0, 0);
    show(
      <MessageList messages={[msg('1', 'u2', 'old', yesterday.toISOString()), msg('2', 'u2', 'new', at(9, 0))]} myId="me" />,
    );
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  /**
   * The day separators are the only words this component owns, and the month
   * and weekday names beside them come from `toLocaleDateString` — which takes
   * the browser's language, not the one the reader chose, unless it is told.
   */
  it('separates days in the reader’s language', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    await preloadCatalogue();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 0, 0, 0);
    render(
      <MemoryRouter>
        <I18nProvider>
          <MessageList
            messages={[msg('1', 'u2', 'alt', yesterday.toISOString()), msg('2', 'me', 'neu', at(9, 0))]}
            myId="me"
          />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Gestern')).toBeInTheDocument();
    expect(screen.getByText('Heute')).toBeInTheDocument();
    // and the run label, which is the other word it owns
    expect(screen.getByText('Du')).toBeInTheDocument();
    localStorage.clear();
  });

  it('renders a deleted group message as a tombstone, not its body', () => {
    show(
      <MessageList
        messages={[msg('1', 'u2', 'the original text', at(10, 0), { username: 'zana', deleted: true })]}
        myId="me"
      />,
    );
    expect(screen.getByText('message deleted')).toBeInTheDocument();
    expect(screen.queryByText('the original text')).not.toBeInTheDocument();
  });

  it('renders a status only against your own run', () => {
    show(
      <MessageList
        messages={[msg('1', 'me', 'mine', at(10, 0)), msg('2', 'u2', 'theirs', at(10, 30))]}
        myId="me"
        renderStatus={() => <span data-testid="receipt">Read</span>}
      />,
    );
    expect(screen.getAllByTestId('receipt')).toHaveLength(1);
  });

  it('lets the thread draw a card, with no bubble of its own around it', () => {
    const { container } = show(
      <MessageList
        messages={[
          msg('1', 'u2', null as unknown as string, at(10, 0), { username: 'zana', kind: 'game', game: { game: 'wordle-battle', lobbyId: 'b1' } }),
          msg('2', 'u2', 'see you there', at(10, 1), { username: 'zana' }),
        ]}
        myId="me"
        renderBody={(m) => ((m as { kind?: string }).kind === 'game' ? <span>the game card</span> : undefined)}
      />,
    );
    expect(screen.getByText('the game card').closest('.bubble')).toHaveClass('is-card');
    // anything the thread does not draw is still text
    expect(screen.getByText('see you there').closest('.bubble')).not.toHaveClass('is-card');
    expect(container.querySelectorAll('.bubble')).toHaveLength(2);
  });

  it('renders nothing for an empty thread', () => {
    const { container } = show(<MessageList messages={[]} myId="me" />);
    expect(container.querySelectorAll('.chat-run')).toHaveLength(0);
    expect(container.querySelectorAll('.chat-day')).toHaveLength(0);
  });

  /**
   * A message can be reported where it is read: from its options, which a
   * keyboard reaches by a button that is out of sight until focused. Only
   * other people's messages — your own are not yours to report.
   */
  it('offers Report among other people’s messages’ options, and only theirs', async () => {
    const onReport = vi.fn();
    show(
      <MessageList
        messages={[
          msg('1', 'u2', 'mean thing', at(10, 0), { username: 'zana' }),
          msg('2', 'me', 'my reply', at(10, 1), { username: 'me' }),
        ]}
        myId="me"
        onReport={onReport}
      />,
    );
    const menus = screen.getAllByRole('button', { name: /More about zana’s message/ });
    expect(menus).toHaveLength(1);
    await userEvent.click(menus[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('lets the thread draw a message that is more than text', () => {
    show(
      <MessageList
        messages={[{ id: '1', senderId: 'u2', body: null, createdAt: at(10, 0), username: 'zana', kind: 'gift' as const }]}
        myId="me"
        renderBody={(m) => (m.kind === 'gift' ? <span>a wrapped present</span> : undefined)}
      />,
    );
    expect(screen.getByText('a wrapped present').closest('.bubble')).toHaveClass('is-card');
  });

  /*
   * Nothing sits beside a message. Held on a touch screen, or right-clicked,
   * it opens its options under it: Copy for its words, Report for someone
   * else's. A finger that moves is scrolling and opens nothing.
   */
  it('opens a message’s options when it is held, with Copy and Report', async () => {
    vi.useFakeTimers();
    try {
      const { container } = show(<MessageList messages={[msg('1', 'u2', 'silav', at(10, 0), { username: 'zana' })]} myId="me" onReport={vi.fn()} />);
      const line = container.querySelector('.bubble-line')!;
      // no visible ⋯ in the thread
      expect(container.querySelector('.msg-menu-btn')).toBeNull();
      fireEvent.pointerDown(line, { pointerType: 'touch' });
      expect(line).toHaveClass('is-pressing');
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens nothing for a finger that scrolls', () => {
    vi.useFakeTimers();
    try {
      const { container } = show(<MessageList messages={[msg('1', 'u2', 'silav', at(10, 0), { username: 'zana' })]} myId="me" onReport={vi.fn()} />);
      const line = container.querySelector('.bubble-line')!;
      fireEvent.pointerDown(line, { pointerType: 'touch' });
      fireEvent.pointerMove(line, { pointerType: 'touch', movementY: 12 });
      act(() => vi.advanceTimersByTime(800));
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies your own message from a right click, and says it did', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = show(<MessageList messages={[msg('1', 'me', 'my words', at(10, 0), { username: 'me' })]} myId="me" onReport={vi.fn()} />);
    fireEvent.contextMenu(container.querySelector('.bubble-line')!);
    // your own message: nothing to report, only its words to copy
    expect(screen.queryByRole('menuitem', { name: 'Report' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('my words');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
