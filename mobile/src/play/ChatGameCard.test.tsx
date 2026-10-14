// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyCard } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from './testing/navigation';
import { cardAction, ChatGameCard, gameCardOf } from './ChatGameCard';

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

  it('lets a player already in it open it', async () => {
    testAuth.client = fakeClient({ [`GET /play/cards/stories/${LOBBY}`]: ok(card({ isMember: true, canJoin: false, status: 'full' })) });
    renderWithProviders(<ChatGameCard game="stories" lobbyId={LOBBY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open: Stories' }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: LOBBY });
  });
});
