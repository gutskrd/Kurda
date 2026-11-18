import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { playCardsPath, type LobbyCard } from '@kurda/shared';
import { fakeApi, refused, type Call } from '../stories/testing';
import { ChatGameCard, gameCardBody } from './ChatGameCard';
import { renderPlay, signedInAndListening, where } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const card = (over: Partial<LobbyCard> = {}): LobbyCard => ({
  game: 'wordle-battle',
  lobbyId: 'b1',
  status: 'open',
  players: 2,
  maxPlayers: 4,
  summary: { difficulty: 'easy' },
  canJoin: true,
  isMember: false,
  ...over,
});

// A chat's cards are read together; this answers the read of this one.
const CARD = 'GET /play/cards';
const cards = (c: LobbyCard) => ({ cards: [c] });
const READ = playCardsPath([{ game: 'wordle-battle', lobbyId: 'b1' }]);

describe('ChatGameCard', () => {
  it('shows the game, how it is set and who has joined, and joins in one tap', async () => {
    const { calls } = fakeApi({ [CARD]: cards(card()), 'POST /wordle/battles/b1/join': { id: 'b1' } });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);

    expect(await screen.findByText('2 of 4 joined')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pêşbaziya Peyvan invite' })).toHaveTextContent('Easy');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(where()).toBe('/app/games/peyvok-battle?id=b1'));
    expect(calls.some((c: Call) => c.method === 'POST' && c.path === '/wordle/battles/b1/join')).toBe(true);
  });

  it('says nothing of Rated or Friendly on the card', async () => {
    fakeApi({ [CARD]: cards(card({ summary: { difficulty: 'easy', rated: true } })) });
    const { container } = renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await waitFor(() => expect(container.querySelector('.invite-title')).not.toBeNull());
    expect(screen.queryByText('Rated')).toBeNull();
  });

  it('opens the game for someone already in it', async () => {
    fakeApi({ [CARD]: cards(card({ isMember: true, canJoin: false, status: 'started' })) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('Started')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/app/games/peyvok-battle?id=b1');
  });

  it('reads as no longer available when the reader may not see it — the same as gone', async () => {
    fakeApi({ [CARD]: cards(card({ status: 'unavailable', canJoin: false, players: 0, maxPlayers: 0, summary: {} })) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('No longer available')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('changes with the game when the server says it changed, without polling', async () => {
    let state = card();
    const { calls } = fakeApi({ [CARD]: () => cards(state), 'GET /play/invites': { incoming: [], outgoing: [] } });
    const { realtime } = renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await screen.findByText('2 of 4 joined');
    await signedInAndListening(calls);

    state = card({ status: 'finished', canJoin: false });
    // Another lobby's change is not this card's.
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'other' });
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'b1' }, 'group:g1');
    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === READ)).toHaveLength(2);
  });

  it('reads the cards a thread shows together, in one request', async () => {
    const { calls } = fakeApi({ [CARD]: { cards: [card(), card({ lobbyId: 'b2', players: 3 })] } });
    renderPlay(
      <>
        <ChatGameCard game="wordle-battle" lobbyId="b1" />
        <ChatGameCard game="wordle-battle" lobbyId="b2" />
      </>,
    );
    expect(await screen.findByText('3 of 4 joined')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 joined')).toBeInTheDocument();
    const reads = calls.filter((c) => c.path.startsWith('/play/cards'));
    expect(reads.map((c) => c.path)).toEqual([playCardsPath([{ game: 'wordle-battle', lobbyId: 'b1' }, { game: 'wordle-battle', lobbyId: 'b2' }])]);
  });

  it('says why a Join did not work, and reads the card again', async () => {
    const { calls } = fakeApi({ [CARD]: cards(card()), 'POST /wordle/battles/b1/join': refused(409, 'BATTLE_FULL') });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(await screen.findByText('This game is full.')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path === READ)).toHaveLength(2));
  });
});

describe('ChatGameCard as a ticket', () => {
  const stampOf = () => document.querySelector('.ticket-stamp');

  it('is a ticket in the game’s colour while it can be joined, with no stamp', async () => {
    fakeApi({ [CARD]: cards(card()) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    const ticket = await screen.findByRole('group', { name: 'Pêşbaziya Peyvan invite' });
    await screen.findByText('2 of 4 joined');
    expect(ticket).toHaveClass('ticket', 'ticket--wordle-battle');
    expect(stampOf()).toBeNull();
  });

  it('is stamped for someone already in it', async () => {
    fakeApi({ [CARD]: cards(card({ isMember: true, canJoin: false })) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('You’re in')).toHaveClass('ticket-stamp', 'is-success');
    // Already in when the conversation was opened: stamped, not landing.
    expect(stampOf()).not.toHaveClass('is-fresh');
    expect(screen.getByText('2 of 4 joined')).toBeInTheDocument();
  });

  it('is grey and punched once the game is over, its ending stamped', async () => {
    fakeApi({ [CARD]: cards(card({ status: 'cancelled', canJoin: false })) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('Called off')).toHaveClass('ticket-stamp', 'is-muted');
    const ticket = screen.getByRole('group');
    expect(ticket).toHaveClass('ticket--muted', 'is-punched');
    expect(ticket.querySelector('.chat-game-status')).toBeNull();
  });

  it('is grey and punched when gone, and says so in words', async () => {
    fakeApi({ [CARD]: cards(card({ status: 'unavailable', canJoin: false, players: 0, maxPlayers: 0, summary: {} })) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await screen.findByText('No longer available');
    expect(screen.getByRole('group')).toHaveClass('ticket--muted', 'is-punched');
    expect(stampOf()).toBeNull();
  });

  it('lands the stamp when the reader is in while they watch', async () => {
    let state = card();
    const { calls } = fakeApi({ [CARD]: () => cards(state), 'GET /play/invites': { incoming: [], outgoing: [] } });
    const { realtime } = renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await screen.findByText('2 of 4 joined');
    await signedInAndListening(calls);
    state = card({ isMember: true, canJoin: false, players: 3 });
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'b1' });
    expect(await screen.findByText('You’re in')).toHaveClass('is-fresh');
  });

  it('says whose invite it is to a screen reader', async () => {
    fakeApi({ [CARD]: cards(card()) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" from={{ id: 'u9', name: 'Rojîn' }} />);
    expect(await screen.findByRole('group', { name: 'Game invite from Rojîn: Pêşbaziya Peyvan' })).toBeInTheDocument();
  });
});

describe('gameCardBody', () => {
  it('draws a game message as its card and leaves anything else to the text', () => {
    expect(gameCardBody({ kind: 'game', game: { game: 'stories', lobbyId: 's1' } })).not.toBeUndefined();
    expect(gameCardBody({ kind: 'text' })).toBeUndefined();
    expect(gameCardBody({ kind: 'game', game: null })).toBeUndefined();
    expect(gameCardBody({})).toBeUndefined();
  });
});
