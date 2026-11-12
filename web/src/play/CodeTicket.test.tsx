import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/utils';
import { CodeTicket } from './CodeTicket';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // the clipboard and the share sheet are put on the navigator per test
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (navigator as { share?: unknown }).share;
});

function clipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

function shareSheet(): ReturnType<typeof vi.fn> {
  const share = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  return share;
}

const ticket = (): HTMLElement => screen.getByRole('group', { name: 'Join code' });
const tiles = (): string[] => [...document.querySelectorAll('.code-tile')].map((t) => t.textContent ?? '');

describe('the code ticket', () => {
  it('shows the code in two halves, a tile to each character, in the game’s own colour', () => {
    renderApp(<CodeTicket game="wordle-battle" code="ABC234" />);
    expect(tiles()).toEqual(['A', 'B', 'C', '2', '3', '4']);
    const code = within(ticket()).getByRole('button', { name: 'Copy the join code A B C 2 3 4' });
    // the gap sits between the halves, and the code reads left to right in every language
    expect(code.querySelector('.code-tiles-gap')?.previousElementSibling).toHaveTextContent('C');
    expect(code).toHaveAttribute('dir', 'ltr');
    expect(ticket()).toHaveClass('code-ticket--wordle-battle');
    expect(screen.getByText('Friends open Games → Join with a code and type it in.')).toBeInTheDocument();
  });

  it('copies the code, turns Copy into a tick, and says so', async () => {
    const writeText = clipboard();
    renderApp(<CodeTicket game="rhyme-match" code="ABC234" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('ABC234');
    expect(screen.getByRole('button', { name: 'Copied!' })).toHaveClass('is-done');
    expect(screen.getByRole('status')).toHaveTextContent('Code copied');
    // the tick throws its sparks
    expect(document.querySelector('.code-ticket-burst')).not.toBeNull();
  });

  it('copies the code when the code itself is tapped', async () => {
    const writeText = clipboard();
    renderApp(<CodeTicket game="stories" code="KMN456" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy the join code K M N 4 5 6' }));
    expect(writeText).toHaveBeenCalledWith('KMN456');
    expect(screen.getByRole('status')).toHaveTextContent('Code copied');
  });

  it('says so when the clipboard will not take it', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) }, configurable: true });
    renderApp(<CodeTicket game="wordle-battle" code="ABC234" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t copy. Read the code out to your friend instead.');
    expect(screen.getByRole('button', { name: 'Copy code' })).not.toHaveClass('is-done');
  });

  it('shares one message: a sentence with the code in it, then the code’s own link', async () => {
    const share = shareSheet();
    renderApp(<CodeTicket game="wordle-battle" code="ABC234" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    // the link is last, where a message draws it as the game's card: the game and the code, on the site the ticket is on
    expect(share).toHaveBeenCalledWith({
      title: 'Peyvok Battle',
      text: `Play Peyvok Battle with me on Hevalo! Open Games → Join with a code and type ABC 234.\nOr tap to join: ${window.location.origin}/join/peyvok-battle/ABC234`,
    });
    // nothing is handed over beside the words: some share targets drop a link sent that way
    expect(share.mock.calls[0]![0]).not.toHaveProperty('url');
  });

  it('says what each game is asking a friend to do', async () => {
    const share = shareSheet();
    renderApp(<CodeTicket game="stories" code="ABC234" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share.mock.calls[0]![0]).toEqual({
      title: 'Stories',
      text: `Read a Kurdish story with me on Hevalo! Open Games → Join with a code and type ABC 234.\nOr tap to join: ${window.location.origin}/join/stories/ABC234`,
    });
  });

  it('copies the same message where there is no share sheet', async () => {
    const writeText = clipboard();
    renderApp(<CodeTicket game="rhyme-match" code="ABC234" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(
      `Play Rhyme Match with me on Hevalo! Open Games → Join with a code and type ABC 234.\nOr tap to join: ${window.location.origin}/join/rhyme-match/ABC234`,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Invite copied. Paste it in a message to your friend.');
  });

  it('takes a closed share sheet quietly', async () => {
    const writeText = clipboard();
    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => Promise.reject(new DOMException('closed', 'AbortError'))), configurable: true });
    renderApp(<CodeTicket game="rhyme-match" code="ABC234" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps Invite friends beside the code', () => {
    renderApp(<CodeTicket game="wordle-battle" code="ABC234" invite={<button type="button">Invite friends</button>} />);
    expect(within(ticket()).getByRole('button', { name: 'Invite friends' })).toBeInTheDocument();
  });

  it('says who may join with it', () => {
    renderApp(<CodeTicket game="stories" code="ABC234" access="open" />);
    expect(screen.getByText('Any adult can join with it: Games → Join with a code.')).toBeInTheDocument();
  });

  it('is gone with the code, leaving Invite friends on its own', () => {
    const first = renderApp(<CodeTicket game="wordle-battle" code={null} invite={<button type="button">Invite friends</button>} />);
    expect(screen.queryByRole('group', { name: 'Join code' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument();
    // drawn afresh inside the app's own providers: the ticket reads who is signed in, for the link it shares
    first.unmount();
    renderApp(<CodeTicket game="wordle-battle" code={null} />);
    expect(document.querySelector('.code-ticket, .code-ticket-alone')).toBeNull();
  });

  it('lets its glint rest while the tab is in the back', async () => {
    renderApp(<CodeTicket game="wordle-battle" code="ABC234" />);
    expect(ticket()).toHaveClass('is-awake');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(ticket()).not.toHaveClass('is-awake'));
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(ticket()).toHaveClass('is-awake'));
  });

  it('never glints, and throws no sparks, under Reduce Motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    clipboard();
    renderApp(<CodeTicket game="wordle-battle" code="ABC234" />);
    expect(ticket()).not.toHaveClass('is-awake');
    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(screen.getByRole('status')).toHaveTextContent('Code copied');
    expect(document.querySelector('.code-ticket-burst')).toBeNull();
  });
});
