import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LobbyCard } from '@kurda/shared';
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

const CARD = 'GET /play/cards/wordle-battle/b1';

describe('ChatGameCard', () => {
  it('shows the game, how it is set and who has joined, and joins in one tap', async () => {
    const { calls } = fakeApi({ [CARD]: card(), 'POST /wordle/battles/b1/join': { id: 'b1' } });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);

    expect(await screen.findByText('2 of 4 joined')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Peyvok Battle invite' })).toHaveTextContent('Easy');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(where()).toBe('/app/games/peyvok-battle?id=b1'));
    expect(calls.some((c: Call) => c.method === 'POST' && c.path === '/wordle/battles/b1/join')).toBe(true);
  });

  it('says on the card whether the game is Rated or Friendly, before anyone joins', async () => {
    fakeApi({ [CARD]: card({ summary: { difficulty: 'easy', rated: true } }) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('Rated')).toBeInTheDocument();
  });

  it('opens the game for someone already in it', async () => {
    fakeApi({ [CARD]: card({ isMember: true, canJoin: false, status: 'started' }) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('Started')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/app/games/peyvok-battle?id=b1');
  });

  it('reads as no longer available when the reader may not see it — the same as gone', async () => {
    fakeApi({ [CARD]: card({ status: 'unavailable', canJoin: false, players: 0, maxPlayers: 0, summary: {} }) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('No longer available')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('changes with the game when the server says it changed, without polling', async () => {
    let state = card();
    const { calls } = fakeApi({ [CARD]: () => state, 'GET /play/invites': { incoming: [], outgoing: [] } });
    const { realtime } = renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await screen.findByText('2 of 4 joined');
    await signedInAndListening(calls);

    state = card({ status: 'finished', canJoin: false });
    // another lobby's change is not this card's
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'other' });
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'b1' }, 'group:g1');
    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/play/cards/wordle-battle/b1')).toHaveLength(2);
  });

  it('says why a Join did not work, and reads the card again', async () => {
    const { calls } = fakeApi({ [CARD]: card(), 'POST /wordle/battles/b1/join': refused(409, 'BATTLE_FULL') });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(await screen.findByText('This game is full.')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path === '/play/cards/wordle-battle/b1')).toHaveLength(2));
  });
});

describe('ChatGameCard as a ticket', () => {
  const stampOf = () => document.querySelector('.ticket-stamp');

  it('is a ticket in the game’s colour while it can be joined, with no stamp', async () => {
    fakeApi({ [CARD]: card() });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    const ticket = await screen.findByRole('group', { name: 'Peyvok Battle invite' });
    await screen.findByText('2 of 4 joined');
    expect(ticket).toHaveClass('ticket', 'ticket--wordle-battle');
    expect(stampOf()).toBeNull();
  });

  it('is stamped for someone already in it', async () => {
    fakeApi({ [CARD]: card({ isMember: true, canJoin: false }) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('You’re in')).toHaveClass('ticket-stamp', 'is-success');
    // already in when the conversation was opened: stamped, not landing
    expect(stampOf()).not.toHaveClass('is-fresh');
    expect(screen.getByText('2 of 4 joined')).toBeInTheDocument();
  });

  it('is grey and punched once the game is over, its ending stamped', async () => {
    fakeApi({ [CARD]: card({ status: 'cancelled', canJoin: false }) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    expect(await screen.findByText('Called off')).toHaveClass('ticket-stamp', 'is-muted');
    const ticket = screen.getByRole('group');
    expect(ticket).toHaveClass('ticket--muted', 'is-punched');
    expect(ticket.querySelector('.chat-game-status')).toBeNull();
  });

  it('is grey and punched when gone, and says so in words', async () => {
    fakeApi({ [CARD]: card({ status: 'unavailable', canJoin: false, players: 0, maxPlayers: 0, summary: {} }) });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await screen.findByText('No longer available');
    expect(screen.getByRole('group')).toHaveClass('ticket--muted', 'is-punched');
    expect(stampOf()).toBeNull();
  });

  it('lands the stamp when the reader is in while they watch', async () => {
    let state = card();
    const { calls } = fakeApi({ [CARD]: () => state, 'GET /play/invites': { incoming: [], outgoing: [] } });
    const { realtime } = renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" />);
    await screen.findByText('2 of 4 joined');
    await signedInAndListening(calls);
    state = card({ isMember: true, canJoin: false, players: 3 });
    realtime.emit({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'b1' });
    expect(await screen.findByText('You’re in')).toHaveClass('is-fresh');
  });

  it('says whose invite it is to a screen reader', async () => {
    fakeApi({ [CARD]: card() });
    renderPlay(<ChatGameCard game="wordle-battle" lobbyId="b1" from={{ id: 'u9', name: 'Rojîn' }} />);
    expect(await screen.findByRole('group', { name: 'Game invite from Rojîn: Peyvok Battle' })).toBeInTheDocument();
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
