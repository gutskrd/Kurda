// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyCard } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from './testing/navigation';
import { cardAction, cardSpent, cardStamp, ChatGameCard, gameCardOf } from './ChatGameCard';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

const LOBBY = 'a1b2c3d4-0000-4000-8000-000000000001';
const card = (over: Partial<LobbyCard>): LobbyCard => ({
  game: 'stories',
  lobbyId: LOBBY,
  status: 'open',
  players: 2,
  maxPlayers: 8,
  summary: { storyTitle: 'Nanê Germ', questionCount: 5 },
  canJoin: true,
  isMember: false,
  ...over,
});

describe('cardAction', () => {
  it('gives the strong button only to a game still gathering players', () => {
    expect(cardAction(card({}))).toEqual({ kind: 'join', prominent: true });
    expect(cardAction(card({ isMember: true, canJoin: false }))).toEqual({ kind: 'enter', prominent: true });
    expect(cardAction(card({ status: 'full', isMember: true, canJoin: false }))).toEqual({ kind: 'enter', prominent: true });
    // a game under way or over keeps a quiet way in, so past games do not shout
    expect(cardAction(card({ status: 'started', isMember: true, canJoin: false }))).toEqual({ kind: 'enter', prominent: false });
    expect(cardAction(card({ status: 'finished', isMember: true, canJoin: false }))).toEqual({ kind: 'enter', prominent: false });
    expect(cardAction(card({ status: 'cancelled', isMember: true, canJoin: false }))).toBeNull();
    expect(cardAction(card({ status: 'finished', canJoin: false }))).toBeNull();
    expect(cardAction(null)).toBeNull();
  });
});

describe('cardStamp and cardSpent', () => {
  it('stamps a game the viewer is in, and one that is over with how it ended', () => {
    expect(cardStamp(card({}))).toBeNull();
    expect(cardStamp(card({ status: 'full', canJoin: false }))).toBeNull();
    expect(cardStamp(card({ isMember: true, canJoin: false }))).toEqual({ key: 'play.card.joined', tone: 'success' });
    expect(cardStamp(card({ status: 'started', isMember: true, canJoin: false }))).toEqual({ key: 'play.card.joined', tone: 'success' });
    expect(cardStamp(card({ status: 'finished', isMember: true, canJoin: false }))).toEqual({ key: 'play.card.finished', tone: 'muted' });
    expect(cardStamp(card({ status: 'cancelled', canJoin: false }))).toEqual({ key: 'play.card.cancelled', tone: 'muted' });
    // a card this viewer may not see says so in words, and gives nothing away with a stamp
    expect(cardStamp(card({ status: 'unavailable', isMember: true, canJoin: false }))).toBeNull();
    expect(cardStamp(null)).toBeNull();
  });

  it('greys and punches a ticket that is spent: over, called off, or not to be seen', () => {
    expect(cardSpent(card({}))).toBe(false);
    expect(cardSpent(card({ status: 'started' }))).toBe(false);
    for (const status of ['finished', 'cancelled', 'unavailable'] as const) expect(cardSpent(card({ status }))).toBe(true);
    expect(cardSpent(null)).toBe(false);
  });
});

describe('gameCardOf', () => {
  it('draws a game message as its card, and an old invite link as one too, keeping the words around it', () => {
    expect(gameCardOf({ kind: 'game', game: { game: 'rhyme-match', lobbyId: 'x' }, body: null })).toEqual({ game: 'rhyme-match', lobbyId: 'x', rest: '' });
    expect(gameCardOf({ kind: 'text', body: `Come! https://hevalo.app/app/games/wordle-battle?id=${LOBBY}` })).toEqual({
      game: 'wordle-battle',
      lobbyId: LOBBY,
      rest: 'Come!',
    });
    expect(gameCardOf({ body: 'just words' })).toBeNull();
    expect(gameCardOf({ kind: 'gift', body: null })).toBeNull();
  });
});

describe('ChatGameCard', () => {
  beforeEach(() => navigation.navigate.mockClear());
  afterEach(cleanup);

  it('shows the lobby as it is now, and joins it through the game’s own screen', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({})) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    expect(await screen.findByText('Open · 2 of 8 joined')).toBeTruthy();
    expect(screen.getByText('“Nanê Germ” · 5 questions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join: Stories' }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: LOBBY });
  });

  it('offers nothing to press on a game that cannot be joined, and says so in words', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ status: 'started', canJoin: false })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    expect(await screen.findByText('Under way')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('looks the same for a game the viewer may not see as for one that is gone', async () => {
    testAuth.client = fakeClient({
      [`GET /play/cards/wordle-battle/${LOBBY}`]: ok(card({ game: 'wordle-battle', status: 'unavailable', canJoin: false, summary: {} })),
    });
    renderWithProviders(<ChatGameCard game="wordle-battle" lobbyId={LOBBY} />);
    expect(await screen.findByText('This game isn’t available.')).toBeTruthy();
  });

  it('reports the message it came in on a long press, without joining (someone else’s card)', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({})) });
    const onReport = vi.fn();
    navigation.navigate.mockClear();
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} onReport={onReport} />);
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Join: Stories' }), { button: 0, buttons: 1 });
    // a hold is a real long press, so wait longer than findBy's default second
    await waitFor(() => expect(onReport).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('lets a player already in it open it', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ isMember: true, canJoin: false, status: 'full' })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open: Stories' }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: LOBBY });
  });
});

describe('ChatGameCard, as a ticket', () => {
  beforeEach(() => navigation.navigate.mockClear());
  afterEach(cleanup);

  it('stamps "You’re in" on a game the viewer has joined, and keeps the way back in', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ isMember: true, canJoin: false })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    expect(await screen.findByText('You’re in')).toBeTruthy();
    expect(screen.getByText('Open · 2 of 8 joined')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open: Stories' }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: LOBBY });
  });

  it('stamps a game that is over with how it ended, once, rather than saying it twice', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ status: 'finished', isMember: true, canJoin: false })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    expect(await screen.findByText('Finished')).toBeTruthy();
    expect(screen.getAllByText('Finished')).toHaveLength(1);
    expect(screen.queryByText('You’re in')).toBeNull();
    cleanup();
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ status: 'cancelled', canJoin: false })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    expect(await screen.findByText('Called off')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('wears no stamp while it is simply open to join', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({})) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    expect(await screen.findByRole('button', { name: 'Join: Stories' })).toBeTruthy();
    expect(screen.queryByText('You’re in')).toBeNull();
    expect(screen.queryByText('Finished')).toBeNull();
  });

  it('says who posted it, on the ticket and to a screen reader', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ status: 'started', canJoin: false })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} from="rojin" />);
    expect(await screen.findByText('Under way')).toBeTruthy();
    expect(screen.getByText('From rojin')).toBeTruthy();
    // with nothing to press, the card is read as one element
    expect(screen.getByLabelText('From rojin. Game card: Stories. Under way')).toBeTruthy();
  });
});
