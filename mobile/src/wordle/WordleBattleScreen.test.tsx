// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { WordleBattleScreen } from './WordleBattleScreen';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('WordleBattleScreen', () => {
  afterEach(cleanup);

  it('follows a new battle opened while it is on screen (an invite’s Join, a card, a new game)', async () => {
    // neither battle exists here; what matters is which one the screen asks for
    const client = fakeClient({
      'GET /wordle/battles/battle-a': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
      'GET /wordle/battles/battle-b': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
    });
    testAuth.client = client;
    const view = renderWithProviders(<WordleBattleScreen id="battle-a" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/wordle/battles/battle-a')).toBe(true);

    // the same screen, given new params (render's wrapper is kept on a rerender)
    view.rerender(<WordleBattleScreen id="battle-b" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/wordle/battles/battle-b')).toBe(true);
  });
});
