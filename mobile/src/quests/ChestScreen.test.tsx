// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { ChestScreen } from './ChestScreen';

/*
 * The chest screen: shut and waiting, the lid swings open on a tap, the rays turn and the contents rise as a tile
 * with a count; under Reduce Motion it just stands open with still rays.
 */

// Full motion here, so the lid is seen going and the rays turning.
patchReactNativeWeb();
afterEach(cleanup);

const opening = ok({ questId: 'q:streak', tier: 'rare', currency: 'zer', amount: 40, balance: 1292, earnsZer: true });

describe('the chest screen', () => {
  it('waits shut with its lid on and its lock glinting, then swings open on a tap: the rays turn and the count rises out of it', async () => {
    testAuth.client = fakeClient({ 'POST /me/quests/q%3Astreak/claim': opening });
    renderWithProviders(<ChestScreen questId="q:streak" tier="rare" onDone={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Rare chest' })).toBeTruthy();
    expect(screen.getByTestId('chest-art-lid')).toBeTruthy();
    expect(screen.queryByTestId('chest-art-lid-open')).toBeNull();
    expect(screen.queryByTestId('chest-art-rays-turning')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open the chest' }));
    expect(await screen.findByRole('heading', { name: '+40 Zêr' })).toBeTruthy();
    expect(screen.getByText('× 40')).toBeTruthy();
    expect(screen.getByLabelText('You have 1,292 Zêr')).toBeTruthy();
    // The shut lid is still there on its way out, the open one has landed, and the rays are going round.
    expect(screen.getByTestId('chest-art-lid')).toBeTruthy();
    expect(screen.getByTestId('chest-art-lid-open')).toBeTruthy();
    expect(screen.getByTestId('chest-art-rays-turning')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says once that Zêr in chests is a members’ perk to someone who does not earn it, and counts none', async () => {
    testAuth.client = fakeClient({ 'POST /me/quests/q%3Astreak/claim': ok({ questId: 'q:streak', tier: 'rare', currency: 'zer', amount: 0, balance: 40, earnsZer: false }) });
    renderWithProviders(<ChestScreen questId="q:streak" tier="rare" onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the chest' }));
    expect(await screen.findByRole('heading', { name: 'Zêr in chests comes with Hevalo+.' })).toBeTruthy();
    expect(screen.queryByText('× 0')).toBeNull();
    expect(screen.queryByLabelText('You have 40 Zêr')).toBeNull();
  });

  it('simply stands open under Reduce Motion, the rays still, the gold fading in', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    try {
      testAuth.client = fakeClient({ 'POST /me/quests/q%3Astreak/claim': opening });
      renderWithProviders(<ChestScreen questId="q:streak" tier="rare" onDone={() => undefined} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open the chest' }));
      expect(await screen.findByRole('heading', { name: '+40 Zêr' })).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId('chest-art-lid')).toBeNull());
      expect(screen.getByTestId('chest-art-lid-open')).toBeTruthy();
      expect(screen.getByTestId('chest-art-rays')).toBeTruthy();
      expect(screen.queryByTestId('chest-art-rays-turning')).toBeNull();
    } finally {
      patchReactNativeWeb();
    }
  });
});
