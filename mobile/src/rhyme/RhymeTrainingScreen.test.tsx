// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../feedback/gameFinished', () => ({ reportGameFinished: vi.fn(), leftResults: vi.fn() }));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { reportGameFinished } from '../feedback/gameFinished';
import { RhymeTrainingScreen } from './RhymeTrainingScreen';

patchReactNativeWeb({ reduceMotion: true });

const round = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  prompt: 'dar',
  windowMs: 60_000,
  remainingMs: 60_000,
  score: 0,
  accepted: 0,
  status: 'active',
  xpAwarded: null,
  ...over,
});

beforeEach(() => vi.mocked(reportGameFinished).mockClear());
afterEach(cleanup);

describe('RhymeTrainingScreen', () => {
  it('reports a round ended early with "End round" as given up, so no rating box follows', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(round()),
      'POST /rhyme/training/r1/end': ok({ game: round({ status: 'ended', remainingMs: 0 }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'End round' }));
    await waitFor(() => expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'other', gaveUp: true }));
  });

  it('reports a round that ran out of time as finished', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(round({ remainingMs: 1000 })),
      'POST /rhyme/training/r1/end': ok({ game: round({ status: 'ended', remainingMs: 0, score: 3, accepted: 1 }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    await waitFor(() => expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'other', gaveUp: false }), { timeout: 3000 });
  });
});
