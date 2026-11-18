// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import type { ChatMessage } from '../gifts/api';
import { MessageContent, hasControls, isCardMessage } from './MessageContent';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

afterEach(cleanup);

const LOBBY = 'a1b2c3d4-0000-4000-8000-000000000001';
const message = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm1', senderId: 'u2', body: null, createdAt: '2026-05-01T10:00:00Z', ...over }) as ChatMessage;

function show(m: ChatMessage, mine = false): ReturnType<typeof fakeClient> {
  const client = fakeClient();
  testAuth.client = client;
  renderWithProviders(<MessageContent message={m} mine={mine} senderName="Rojda" onOpenGift={() => undefined} onReport={mine ? undefined : () => undefined} />);
  return client;
}

/*
 * Invitations to retired games (Don't Say the Word!, Kurdish Bluff) still in a chat show a quiet line saying so,
 * with nothing to press and no room fetched.
 */
describe('an invitation to a game that has been retired, in a chat', () => {
  it('is one quiet line saying the game is no longer played, with nothing to press', () => {
    const client = show(message({ kind: 'game', game: { game: 'dont-say', lobbyId: LOBBY } } as never));
    expect(screen.getByText('This game is no longer played.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    // The room is not looked up: there is no such game to ask about.
    expect(client.calls).toEqual([]);
  });

  it('keeps the words sent beside an old invite link, and still shows no card', () => {
    const client = show(message({ kind: 'text', body: `Come and play! https://hevalo.app/app/games/bluff?id=${LOBBY}` }), true);
    expect(screen.getByText('Come and play!')).toBeTruthy();
    expect(screen.getByText('This game is no longer played.')).toBeTruthy();
    expect(screen.queryByText(/app\/games/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(client.calls).toEqual([]);
  });

  it('is drawn without a bubble of its own, as a card is', () => {
    expect(isCardMessage(message({ kind: 'text', body: `/app/games/dont-say?id=${LOBBY}` }))).toBe(true);
    expect(hasControls(message({ kind: 'text', body: 'just words' }))).toBe(false);
  });
});
