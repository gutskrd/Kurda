// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { RhymeMatchScreen } from './RhymeMatchScreen';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('RhymeMatchScreen', () => {
  afterEach(cleanup);

  it('follows a new match opened while it is on screen (an invite’s Join, a card, a new game)', async () => {
    // neither match exists here; what matters is which one the screen asks for
    const client = fakeClient({
      'GET /rhyme/matches/match-a': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
      'GET /rhyme/matches/match-b': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
    });
    testAuth.client = client;
    const view = renderWithProviders(<RhymeMatchScreen id="match-a" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/rhyme/matches/match-a')).toBe(true);

    // the same screen, given new params (render's wrapper is kept on a rerender)
    view.rerender(<RhymeMatchScreen id="match-b" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/rhyme/matches/match-b')).toBe(true);
  });
});
